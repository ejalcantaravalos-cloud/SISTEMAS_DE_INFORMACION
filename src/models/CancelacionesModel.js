const db = require('../Database/db').promise();
const mysql = require('mysql2/promise');
const Reagendaciones = require('./ReagendacionesModel');

// ========================================
// CONFIGURACIÓN DE LOS TRES SERVICIOS
// ========================================

// Las tablas y los filtros son constantes internas, nunca vienen del cliente.
const AREAS = Object.freeze({
    eventos: {
        tabla: 'reservacion_salon',
        filtro: '1 = 1',
        cancelado: 'Cancelada',
        estados: ['Reservada', 'En uso']
    },
    inflables: {
        tabla: 'reservacion_inflable',
        filtro: 'r.incluido_en_reservacion_salon_id IS NULL',
        cancelado: 'Cancelada',
        estados: ['Reservada', 'En uso']
    },
    restaurante: {
        tabla: 'pedido',
        filtro: 'r.reservacion_id IS NULL',
        cancelado: 'Cancelado',
        estados: ['Enviado']
    }
});

function exigir(condicion, mensaje, status = 400) {
    if (!condicion) {
        const error = new Error(mensaje);
        error.status = status;
        throw error;
    }
}

function configuracion(area) {
    exigir(Object.hasOwn(AREAS, area), 'Área inválida.');
    return AREAS[area];
}

async function filas(conexion, sql, parametros = []) {
    const [resultado] = await conexion.query(sql, parametros);
    return resultado;
}

// Usar una conexión exclusiva, también si db.js utiliza createConnection.
async function transaccion(operacion) {
    const pool = typeof db.getConnection === 'function';
    const config = db.connection?.config;

    exigir(pool || config, 'No existe una conexión MySQL exclusiva.', 500);

    const conexion = pool
        ? await db.getConnection()
        : await mysql.createConnection({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
            socketPath: config.socketPath,
            ssl: config.ssl,
            timezone: config.timezone
        });

    try {
        await conexion.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await conexion.beginTransaction();
        const resultado = await operacion(conexion);
        await conexion.commit();
        return resultado;
    } catch (error) {
        try {
            await conexion.rollback();
        } catch (errorRollback) {
            console.error('Rollback de cancelación:', errorRollback);
        }
        throw error;
    } finally {
        if (pool) conexion.release();
        else await conexion.end();
    }
}

// ========================================
// CONSULTAR CANCELACIONES Y SERVICIOS
// ========================================

class CancelacionesModel {
    static async listar(area) {
        const config = configuracion(area);
        let detalle;

        if (area === 'eventos') {
            detalle = `
                SELECT r.id, r.servicio_contratado_id, r.estado,
                    CONCAT(s.nombre, ' / ', COALESCE(v.nombre_evento, 'Evento')) AS servicio,
                    c.nombre AS cliente, r.inicio AS fecha,
                    DATE_FORMAT(r.inicio, '%Y-%m-%d %H:%i:%s') AS inicio_original,
                    DATE_FORMAT(r.fin, '%Y-%m-%d %H:%i:%s') AS fin_original
                FROM reservacion_salon r
                JOIN salones s ON s.id = r.salon_id
                JOIN reservaciones v ON v.id = r.reservacion_id
                JOIN clientes c ON c.id = v.cliente_id`;
        } else if (area === 'inflables') {
            detalle = `
                SELECT r.id, r.servicio_contratado_id, r.estado,
                    i.nombre AS servicio, c.nombre AS cliente, r.inicio AS fecha,
                    DATE_FORMAT(r.inicio, '%Y-%m-%d %H:%i:%s') AS inicio_original,
                    DATE_FORMAT(r.fin, '%Y-%m-%d %H:%i:%s') AS fin_original
                FROM reservacion_inflable r
                JOIN juegos_inflables i ON i.id = r.inflable_id
                JOIN reservaciones v ON v.id = r.reservacion_id
                JOIN clientes c ON c.id = v.cliente_id`;
        } else {
            detalle = `
                SELECT r.id, r.servicio_contratado_id, r.estado,
                    CONCAT('Pedido #', r.id) AS servicio,
                    COALESCE(c.nombre, r.nombre_referencia, 'Venta de restaurante') AS cliente,
                    r.fecha_pedido AS fecha
                FROM pedido r
                JOIN servicio_contratado sc ON sc.id = r.servicio_contratado_id
                JOIN operacion o ON o.id = sc.operacion_id
                LEFT JOIN clientes c ON c.id = o.cliente_id`;
        }

        const pagosAsociados = area === 'eventos'
            ? 'OR pa.servicio_contratado_id IN (SELECT ri.servicio_contratado_id FROM reservacion_inflable ri WHERE ri.incluido_en_reservacion_salon_id = x.id)'
            : '';
        const registros = await filas(db, `
            SELECT x.*, ca.motivo, ca.fecha AS fecha_cancelacion,
                u.nombre AS empleado,
                COALESCE((SELECT SUM(pa.importe) FROM pago_aplicacion pa
                    JOIN concepto_pago cp ON cp.id = pa.concepto_pago_id
                    WHERE (pa.servicio_contratado_id = x.servicio_contratado_id ${pagosAsociados})
                        AND cp.codigo <> 'RETENCION_REAGENDA'), 0) AS pagado,
                EXISTS(SELECT 1 FROM solicitud_devolucion sd
                    WHERE sd.cancelacion_id = ca.id) AS tiene_solicitud
            FROM (${detalle} WHERE ${config.filtro}) x
            LEFT JOIN cancelacion ca ON ca.servicio_contratado_id = x.servicio_contratado_id
            LEFT JOIN usuarios u ON u.id = ca.usuario_id
            ORDER BY x.fecha DESC, x.id DESC
            LIMIT 500
        `);

        return registros.map(registro => ({
            ...registro,
            reagendable: area !== 'restaurante' && !registro.motivo && registro.estado === 'Reservada',
            cancelable: !registro.motivo && config.estados.includes(registro.estado),
            cancelado: registro.estado === config.cancelado || Boolean(registro.motivo)
        }));
    }

    static async historialReagendaciones(area) {
        return Reagendaciones.historial(db, area);
    }

    static async reagendar(area, id, datos, usuarioId) {
        return transaccion(conexion => Reagendaciones.guardar(conexion, area, id, datos, usuarioId));
    }

    static async cobrarAnticipo(area, id, datos, usuarioId) {
        return transaccion(conexion => Reagendaciones.cobrar(conexion, area, id, datos, usuarioId));
    }

    // ========================================
    // CANCELAR DE FORMA ATÓMICA
    // ========================================

    static async cancelar(area, id, datos, usuarioId) {
        const config = configuracion(area);

        return transaccion(async conexion => {
            // Primero localizar y bloquear la operación general.
            const [referencia] = await filas(conexion, `
                SELECT sc.operacion_id
                FROM ${config.tabla} r
                JOIN servicio_contratado sc ON sc.id = r.servicio_contratado_id
                WHERE r.id = ? AND ${config.filtro}
            `, [id]);

            exigir(referencia, 'No se encontró el servicio.', 404);

            await filas(conexion, `
                SELECT id FROM operacion WHERE id = ? FOR UPDATE
            `, [referencia.operacion_id]);

            const [principal] = await filas(conexion, `
                SELECT r.* FROM ${config.tabla} r
                WHERE r.id = ? AND ${config.filtro}
                FOR UPDATE
            `, [id]);

            exigir(principal, 'No se encontró el servicio.', 404);

            const servicios = [{ ...principal, area }];

            // Cancelar el evento completo, no solamente el salón.
            if (area === 'eventos') {
                const inflables = await filas(conexion, `
                    SELECT * FROM reservacion_inflable
                    WHERE incluido_en_reservacion_salon_id = ?
                    ORDER BY id FOR UPDATE
                `, [id]);

                servicios.push(...inflables.map(r => ({ ...r, area: 'inflables' })));

                // Los pedidos de evento pertenecientes a la misma operación.
                const pedidos = await filas(conexion, `
                    SELECT p.* FROM pedido p
                    JOIN servicio_contratado sc ON sc.id = p.servicio_contratado_id
                    WHERE p.reservacion_id = ? AND sc.operacion_id = ?
                    ORDER BY p.id FOR UPDATE
                `, [principal.reservacion_id, referencia.operacion_id]);

                servicios.push(...pedidos.map(r => ({ ...r, area: 'restaurante' })));
            }

            // Validar estados y evitar cancelaciones repetidas.
            for (const servicio of servicios) {
                const c = configuracion(servicio.area);
                const estados = area === 'eventos' && servicio.area === 'restaurante'
                    ? ['Enviado', 'Orden tomada', 'Listo para entregar', 'Entregado']
                    : c.estados;
                exigir(estados.includes(servicio.estado),
                    'El servicio o uno de sus servicios asociados ya está cancelado o finalizado.', 409);

                if (servicio.area === 'restaurante' && servicio.estado === 'Entregado') {
                    exigir(datos.responsable === 'negocio',
                        'Un pedido entregado solo se cancela por una incidencia del negocio.', 409);
                }
            }

            const ids = servicios.map(s => s.servicio_contratado_id).sort((a, b) => a - b);

            await filas(conexion, `
                SELECT id FROM servicio_contratado
                WHERE id IN (?) ORDER BY id FOR UPDATE
            `, [ids]);

            const anteriores = await filas(conexion, `
                SELECT id FROM cancelacion WHERE servicio_contratado_id IN (?) FOR UPDATE
            `, [ids]);

            exigir(!anteriores.length, 'Ya existe una cancelación registrada.', 409);

            // Una solicitud previa puede corresponder a un reembolso parcial.
            // No crear otra automáticamente ni duplicar la deuda.
            const solicitudes = await filas(conexion, `
                SELECT id FROM solicitud_devolucion
                WHERE servicio_contratado_id IN (?) AND estado <> 'RECHAZADA'
                FOR UPDATE
            `, [ids]);

            exigir(!solicitudes.length,
                'Existe una solicitud de devolución previa; revisa el caso antes de cancelar.', 409);

            const pagos = await filas(conexion, `
                SELECT pa.servicio_contratado_id, SUM(pa.importe) AS pagado
                FROM pago_aplicacion pa JOIN concepto_pago cp ON cp.id = pa.concepto_pago_id
                WHERE pa.servicio_contratado_id IN (?) AND cp.codigo <> 'RETENCION_REAGENDA'
                GROUP BY pa.servicio_contratado_id
            `, [ids]);

            let solicitudesCreadas = 0;

            for (const servicio of servicios) {
                const c = configuracion(servicio.area);
                const pagado = Number(pagos.find(p =>
                    Number(p.servicio_contratado_id) === Number(servicio.servicio_contratado_id)
                )?.pagado || 0);

                const motivo = [
                    `Responsable: ${datos.responsable === 'negocio' ? 'ZABAVA' : 'Cliente'}`,
                    `Motivos: ${datos.motivos.join('; ')}`,
                    `Explicación: ${datos.explicacion || 'Sin explicación adicional'}`,
                    `Devolución: ${datos.responsable === 'negocio' && pagado > 0
                        ? 'Pendiente de tramitar' : 'No procede en esta cancelación'}`
                ].join('\n');

                const registro = await filas(conexion, `
                    INSERT INTO cancelacion (servicio_contratado_id, usuario_id, motivo)
                    VALUES (?, ?, ?)
                `, [servicio.servicio_contratado_id, usuarioId, motivo]);

                await conexion.query(`
                    UPDATE ${c.tabla} SET estado = ? WHERE id = ?
                `, [c.cancelado, servicio.id]);

                if (servicio.area === 'restaurante') {
                    // Liberar únicamente reservas no consumidas. No reponer comida preparada.
                    await conexion.query(`
                        UPDATE reserva_inventario ri
                        JOIN detalle_pedido dp ON dp.id = ri.detalle_pedido_id
                        SET ri.estado = 'LIBERADA'
                        WHERE dp.pedido_id = ? AND ri.estado = 'RESERVADA'
                    `, [servicio.id]);
                }

                if (datos.responsable === 'negocio' && pagado > 0) {
                    await conexion.query(`
                        INSERT INTO solicitud_devolucion
                            (servicio_contratado_id, cancelacion_id, usuario_id, motivo, estado)
                        VALUES (?, ?, ?, ?, 'SOLICITADA')
                    `, [servicio.servicio_contratado_id, registro.insertId, usuarioId, motivo]);
                    solicitudesCreadas++;
                }
            }

            return { servicios: servicios.length, solicitudes: solicitudesCreadas };
        });
    }
}

module.exports = CancelacionesModel;
