'use strict';

const conexion = require('../Database/db');
const OrdenModel = require('./OrdenModel');
const db = conexion.promise();

// Consulta exclusiva del seguimiento: NO toca pagos, caja ni inventario.
// Los pedidos activos se muestran aunque sean de días anteriores.
// El historial terminado se limita al día actual para no saturar la pantalla.
async function consultar(estadosActivos, estadoFinalizado) {
    const conn = await db.getConnection();
    try {
        await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await conn.beginTransaction();
        const pedidos = await consultarDetalle(conn, estadosActivos, estadoFinalizado);
        await conn.commit();
        return pedidos;
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

async function consultarDetalle(conn, estadosActivos, estadoFinalizado) {
    const [pedidos] = await conn.query(`
        SELECT p.id, p.tipo_entrega, p.nombre_referencia, p.estado, p.version, p.nota,
                      DATE_FORMAT(p.fecha_pedido, '%d/%m/%Y %H:%i') AS fecha_texto,
                      DATE_FORMAT(p.fecha_entrega, '%d/%m/%Y %H:%i') AS entrega_texto,
                      cli.nombre AS cliente_registrado,
                      u.nombre AS cajero_nombre
        FROM pedido p
        JOIN servicio_contratado sc ON sc.id = p.servicio_contratado_id
        JOIN operacion op ON op.id = sc.operacion_id
        LEFT JOIN clientes cli ON cli.id = op.cliente_id
        JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.estado IN (?) OR (
            p.estado = ?
            AND COALESCE(p.fecha_entrega, p.fecha_pedido) >= CURDATE()
        )
        ORDER BY CASE WHEN p.estado IN (?) THEN 0 ELSE 1 END,
                          p.fecha_pedido ASC, p.id ASC
        LIMIT 150
    `, [estadosActivos, estadoFinalizado, estadosActivos]);

    if (pedidos.length === 0) return [];

    const ids = pedidos.map(pedido => pedido.id);
    const [detalles] = await conn.query(`
        SELECT d.id, d.pedido_id, d.nombre_producto_historico AS nombre,
                      d.cantidad, d.nota_cocina
        FROM detalle_pedido d
        WHERE d.pedido_id IN (?)
        ORDER BY d.id
    `, [ids]);

    const [modificaciones] = detalles.length
        ? await conn.query(`
                SELECT di.detalle_pedido_id,
                              di.nombre_ingrediente_historico AS nombre,
                              di.accion, di.porciones
                FROM detalle_pedido_ingrediente di
                WHERE di.detalle_pedido_id IN (?)
                    AND di.accion IN ('QUITADO', 'EXTRA')
                ORDER BY di.id
            `, [detalles.map(d => d.id)])
        : [[]];

    const [opciones] = detalles.length
        ? await conn.query(`
                SELECT detalle_pedido_id, nombre_opcion_historico AS nombre
                FROM detalle_pedido_opcion
                WHERE detalle_pedido_id IN (?)
                ORDER BY id
            `, [detalles.map(d => d.id)])
        : [[]];

    const detallesPorId = new Map(detalles.map(d => [
        d.id, { ...d, modificaciones: [], opciones: [] }
    ]));
    for (const mod of modificaciones) {
        detallesPorId.get(mod.detalle_pedido_id)?.modificaciones.push(mod);
    }
    for (const opcion of opciones) {
        detallesPorId.get(opcion.detalle_pedido_id)?.opciones.push(opcion);
    }

    const porPedido = new Map(pedidos.map(p => [p.id, { ...p, detalles: [] }]));
    for (const detalle of detallesPorId.values()) {
        porPedido.get(detalle.pedido_id)?.detalles.push(detalle);
    }

    for (const pedido of porPedido.values()) {
        const referencia = String(pedido.nombre_referencia || '').trim();
        const mesa = pedido.tipo_entrega === 'EN_LOCAL'
            ? referencia.match(/^Mesa\s+(\d+)(?:\s*-\s*(.*))?$/i)
            : null;
        pedido.numero_mesa = mesa ? mesa[1] : null;
        pedido.cliente_nombre = pedido.cliente_registrado ||
            (mesa ? (mesa[2] || '') : referencia) || 'Cliente general';
        pedido.tipo_texto = pedido.tipo_entrega === 'PARA_LLEVAR'
            ? 'Para llevar' : pedido.tipo_entrega === 'EVENTO' ? 'Evento' : 'Mesa';
    }

    return [...porPedido.values()];
}

async function listarCocina() {
    return consultar(['Enviado', 'Orden tomada'], 'Listo para entregar');
}

async function listarMesero() {
    return consultar(['Listo para entregar'], 'Entregado');
}

// Reutilizar la transición del modelo de órdenes, que valida el estado actual
// con bloqueo FOR UPDATE dentro de una transacción (evita dos avances simultáneos).
async function tomarPedido(pedidoId, version) {
    return OrdenModel.actualizarEstado(pedidoId, 'Orden tomada', version);
}

async function marcarListo(pedidoId) {
    return OrdenModel.actualizarEstado(pedidoId, 'Listo para entregar');
}

async function marcarEntregado(pedidoId) {
    return OrdenModel.actualizarEstado(pedidoId, 'Entregado');
}

module.exports = { listarCocina, listarMesero, tomarPedido, marcarListo, marcarEntregado };
