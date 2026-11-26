'use strict';

const conexion = require('../Database/db');
const db = conexion.promise();
const TurnoCajaModel = require('./TurnoCajaModel');

function errorValidacion(mensaje, status = 400) {
    const error = new Error(mensaje);
    error.status = status;
    return error;
}

function idValido(valor) {
    return Number.isSafeInteger(Number(valor)) && Number(valor) > 0;
}

function centavos(valor) {
    return Math.round(Number(valor) * 100);
}

// Productos PREPARADOS activos publicados en algún menú vigente.
// No incluimos empaquetados: ese CRUD todavía está pendiente.
async function listarProductosCaja() {
    const [productos] = await db.query(`
        SELECT p.id, p.nombre, p.descripcion, p.precio_base,
                      p.precio_base AS precio, p.imagen_url,
                      c.nombre AS categoria_nombre
        FROM producto p
        JOIN tipo_producto tp ON tp.id = p.tipo_producto_id
        LEFT JOIN categoria c ON c.id = p.categoria_id
        WHERE p.activo = 1 AND tp.codigo = 'PREPARADO'
            AND EXISTS (
                SELECT 1 FROM menu_producto mp
                JOIN menu m ON m.id = mp.menu_id
                WHERE mp.producto_id = p.id AND m.activo = 1
                    AND (m.inicio_vigencia IS NULL OR m.inicio_vigencia <= NOW())
                    AND (m.fin_vigencia IS NULL OR m.fin_vigencia > NOW())
            )
        ORDER BY c.nombre, p.nombre
    `);

    if (!productos.length) return [];

    const [ingredientes] = await db.query(`
        SELECT pi.id AS platillo_ingrediente_id, pi.producto_id,
                      pi.ingrediente_id, ii.nombre AS nombre, um.codigo AS unidad,
                      ti.codigo AS tipo, pi.cantidad_porcion,
                      pi.precio_extra, pi.max_porciones_extra
        FROM platillo_ingrediente pi
        JOIN tipo_ingrediente ti ON ti.id = pi.tipo_ingrediente_id
        JOIN ingrediente i ON i.id = pi.ingrediente_id
        JOIN item_inventario ii ON ii.id = i.item_inventario_id
        JOIN unidad_medida um ON um.id = ii.unidad_medida_id
        WHERE pi.producto_id IN (?)
        ORDER BY pi.producto_id, FIELD(ti.codigo, 'FIJO','REMOVIBLE','EXTRA'), ii.nombre
    `, [productos.map(p => p.id)]);

    const porId = new Map(productos.map(p => [p.id, { ...p, ingredientes: [] }]));
    ingredientes.forEach(fila => porId.get(fila.producto_id)?.ingredientes.push(fila));
    return [...porId.values()];
}

function normalizarPedido(datos) {
    const items = typeof datos.detalles === 'string'
        ? (() => {
                try { return JSON.parse(datos.detalles); }
                catch { throw errorValidacion('El contenido de la orden no es JSON válido.'); }
            })()
        : datos.detalles;

    if (!Array.isArray(items) || items.length === 0 || items.length > 60) {
        throw errorValidacion('La orden debe contener entre 1 y 60 renglones.');
    }

    const normalizados = items.map((item, indice) => {
        if (!item || !idValido(item.id) || !idValido(item.cantidad) || Number(item.cantidad) > 99) {
            throw errorValidacion(`Producto o cantidad inválida en el renglón ${indice + 1}.`);
        }
        const modificaciones = item.modificaciones ?? [];
        if (!Array.isArray(modificaciones) || modificaciones.length > 100) {
            throw errorValidacion('La personalización de un platillo es inválida.');
        }
        if (item.nota_cocina != null &&
                (typeof item.nota_cocina !== 'string' || item.nota_cocina.length > 1000)) {
            throw errorValidacion('La nota de cocina es demasiado larga.');
        }
        return {
            id: Number(item.id),
            cantidad: Number(item.cantidad),
            nota_cocina: item.nota_cocina?.trim() || null,
            modificaciones
        };
    });

    if (!['Mesa', 'EN_LOCAL', 'Para llevar', 'PARA_LLEVAR'].includes(datos.tipo_orden)) {
        throw errorValidacion('Selecciona si la orden es para mesa o para llevar.');
    }
    const tipo = ['Para llevar', 'PARA_LLEVAR'].includes(datos.tipo_orden)
        ? 'PARA_LLEVAR' : 'EN_LOCAL';

    const nombre = typeof datos.nombre_cliente === 'string'
        ? datos.nombre_cliente.trim() : '';
    if (nombre.length > 100) throw errorValidacion('El nombre de referencia es demasiado largo.');

    let referencia = nombre || null;
    if (tipo === 'EN_LOCAL') {
        if (!idValido(datos.numero_mesa)) {
            throw errorValidacion('Indica un número de mesa válido.');
        }
        // El SQL actual NO contiene mesa_id ni numero_mesa en pedido.
        // Conservar la referencia en texto permite tomar órdenes por ahora.
        referencia = `Mesa ${Number(datos.numero_mesa)}${nombre ? ' - ' + nombre : ''}`;
    }
    if (referencia && referencia.length > 120) {
        throw errorValidacion('La referencia del pedido es demasiado larga.');
    }

    const nota = typeof datos.nota === 'string' ? datos.nota.trim() : '';
    if (nota.length > 2000) throw errorValidacion('La nota general es demasiado larga.');

    return { items: normalizados, tipo, referencia, nota, nombreCliente: nombre };
}

// El servidor valida cada elección contra la receta; nunca acepta precios del navegador.
function prepararPersonalizaciones(item, receta) {
    const modificaciones = new Map();
    for (const m of item.modificaciones) {
        const id = Number(m?.platillo_ingrediente_id);
        const accion = m?.accion;
        const porciones = m?.porciones == null ? 1 : Number(m.porciones);
        if (!idValido(id) || !['QUITAR', 'EXTRA'].includes(accion) ||
                !Number.isSafeInteger(porciones) || porciones < 1 || modificaciones.has(id)) {
            throw errorValidacion('Hay una modificación de ingrediente inválida o repetida.');
        }
        modificaciones.set(id, { accion, porciones });
    }

    const registros = [];
    let extrasCentavos = 0;
    for (const ingrediente of receta) {
        const cambio = modificaciones.get(ingrediente.id);
        const comun = {
            ingrediente_id: ingrediente.ingrediente_id,
            nombre: ingrediente.nombre,
            cantidad: Number(ingrediente.cantidad_porcion)
        };

        if (ingrediente.tipo === 'EXTRA') {
            if (cambio) {
                if (cambio.accion !== 'EXTRA' ||
                        cambio.porciones > Number(ingrediente.max_porciones_extra)) {
                    throw errorValidacion('Cantidad de extras inválida para el platillo.');
                }
                registros.push({ ...comun, accion: 'EXTRA', porciones: cambio.porciones,
                    precio_extra_unitario: Number(ingrediente.precio_extra) });
                extrasCentavos += cambio.porciones * centavos(ingrediente.precio_extra);
            }
        } else {
            if (cambio && (ingrediente.tipo !== 'REMOVIBLE' ||
                                          cambio.accion !== 'QUITAR' || cambio.porciones !== 1)) {
                throw errorValidacion('No puedes quitar un ingrediente fijo.');
            }
            registros.push({ ...comun,
                accion: cambio ? 'QUITADO' : 'INCLUIDO', porciones: 1,
                precio_extra_unitario: 0 });
        }
    }

    const idsReceta = new Set(receta.map(r => r.id));
    for (const id of modificaciones.keys()) {
        if (!idsReceta.has(id)) {
            throw errorValidacion('El ingrediente elegido no pertenece a este platillo.');
        }
    }
    return { registros, extrasCentavos };
}

async function prepararLineas(conn, items) {
    const ids = [...new Set(items.map(item => item.id))];
    const [productos] = await conn.query(`
        SELECT p.id, p.nombre, p.precio_base
        FROM producto p
        JOIN tipo_producto tp ON tp.id = p.tipo_producto_id
        WHERE p.id IN (?) AND p.activo = 1 AND tp.codigo = 'PREPARADO'
            AND EXISTS (
                SELECT 1 FROM menu_producto mp
                JOIN menu m ON m.id = mp.menu_id
                WHERE mp.producto_id = p.id AND m.activo = 1
                    AND (m.inicio_vigencia IS NULL OR m.inicio_vigencia <= NOW())
                    AND (m.fin_vigencia IS NULL OR m.fin_vigencia > NOW())
            )
    `, [ids]);
    if (productos.length !== ids.length) {
        throw errorValidacion('Algún platillo ya no está disponible en el menú.');
    }
    const mapaProductos = new Map(productos.map(p => [p.id, p]));

    const [recetas] = await conn.query(`
        SELECT pi.id, pi.producto_id, pi.ingrediente_id, ii.nombre,
                      ti.codigo AS tipo, pi.cantidad_porcion,
                      pi.precio_extra, pi.max_porciones_extra
        FROM platillo_ingrediente pi
        JOIN tipo_ingrediente ti ON ti.id = pi.tipo_ingrediente_id
        JOIN ingrediente i ON i.id = pi.ingrediente_id
        JOIN item_inventario ii ON ii.id = i.item_inventario_id
        WHERE pi.producto_id IN (?)
    `, [ids]);
    const recetasPorId = new Map(ids.map(id => [id, []]));
    recetas.forEach(r => recetasPorId.get(r.producto_id).push(r));

    // Validar toda la orden ANTES de crear registros.
    let totalCentavos = 0;
    const lineas = items.map(item => {
        const producto = mapaProductos.get(item.id);
        const receta = recetasPorId.get(item.id);
        if (!receta.length) throw errorValidacion(`El platillo ${producto.nombre} no tiene receta.`);
        const { registros, extrasCentavos } = prepararPersonalizaciones(item, receta);
        const precioCentavos = centavos(producto.precio_base);
        totalCentavos += item.cantidad * (precioCentavos + extrasCentavos);
        return { item, producto, registros };
    });
    if (!Number.isSafeInteger(totalCentavos) || totalCentavos < 0) {
        throw errorValidacion('El total calculado no es válido.');
    }

    return { lineas, totalCentavos };
}

async function insertarLineas(conn, pedidoId, lineas) {
    // No agrupar por ID: dos hamburguesas del mismo tipo pueden tener cambios distintos.
    for (const linea of lineas) {
        const [detalle] = await conn.query(`
            INSERT INTO detalle_pedido
                (pedido_id, producto_id, nombre_producto_historico,
                  cantidad, precio_unitario, nota_cocina)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [pedidoId, linea.producto.id, linea.producto.nombre,
                linea.item.cantidad, linea.producto.precio_base, linea.item.nota_cocina]);

        for (const r of linea.registros) {
            await conn.query(`
                INSERT INTO detalle_pedido_ingrediente
                    (detalle_pedido_id, ingrediente_id, nombre_ingrediente_historico,
                      accion, porciones, cantidad_inventario_por_unidad, precio_extra_unitario)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [detalle.insertId, r.ingrediente_id, r.nombre, r.accion,
                    r.porciones, r.cantidad, r.precio_extra_unitario]);
        }
    }

}

async function crearOrden(usuarioId, datos) {
    if (!idValido(usuarioId)) throw errorValidacion('Usuario inválido.', 401);
    const { items, tipo, referencia, nota, nombreCliente } = normalizarPedido(datos);
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { lineas, totalCentavos } = await prepararLineas(conn, items);

        const [[area]] = await conn.query(
            "SELECT id FROM area_servicio WHERE codigo = 'RESTAURANTE'"
        );
        if (!area) throw errorValidacion('Falta el área RESTAURANTE en area_servicio.');

        // Conservar el nombre del cliente como dato independiente para órdenes nuevas.
        // Si posteriormente se captura teléfono/correo, podrá vincularse a un cliente existente.
        let clienteId = null;
        if (nombreCliente) {
            const [cliente] = await conn.query(
                'INSERT INTO clientes (nombre) VALUES (?)', [nombreCliente]
            );
            clienteId = cliente.insertId;
        }
        const [operacion] = await conn.query(
            'INSERT INTO operacion (cliente_id, usuario_id, observaciones) VALUES (?, ?, ?)',
            [clienteId, usuarioId, nota || null]
        );
        const [servicio] = await conn.query(
            'INSERT INTO servicio_contratado (operacion_id, area_servicio_id) VALUES (?, ?)',
            [operacion.insertId, area.id]
        );
        const [pedido] = await conn.query(`
            INSERT INTO pedido (servicio_contratado_id, usuario_id, tipo_entrega,
                                                    nombre_referencia, nota, estado)
            VALUES (?, ?, ?, ?, ?, 'Enviado')
        `, [servicio.insertId, usuarioId, tipo, referencia, nota || null]);

        await insertarLineas(conn, pedido.insertId, lineas);

        await conn.commit();
        return {
            id: pedido.insertId,
            total: (totalCentavos / 100).toFixed(2)
        };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

async function listarPedidos() {
    const [pedidos] = await db.query(`
        SELECT pe.*, u.nombre AS cajero_nombre,
                      COALESCE(v.total, 0) AS total
        FROM pedido pe
        JOIN usuarios u ON u.id = pe.usuario_id
        LEFT JOIN v_total_pedido v ON v.pedido_id = pe.id
        ORDER BY pe.id DESC
    `);
    if (!pedidos.length) return [];

    const [detalles] = await db.query(`
        SELECT d.id, d.pedido_id, d.producto_id,
                      d.nombre_producto_historico AS nombre,
                      d.cantidad, d.precio_unitario, d.nota_cocina
        FROM detalle_pedido d
        WHERE d.pedido_id IN (?) ORDER BY d.id
    `, [pedidos.map(p => p.id)]);

    const [ingredientes] = detalles.length
        ? await db.query(`
                SELECT detalle_pedido_id, nombre_ingrediente_historico AS nombre,
                              accion, porciones, precio_extra_unitario
                FROM detalle_pedido_ingrediente
                WHERE detalle_pedido_id IN (?) ORDER BY id
            `, [detalles.map(d => d.id)])
        : [[]];

    const porDetalle = new Map(detalles.map(d => [d.id, { ...d, modificaciones: [] }]));
    ingredientes.forEach(i => porDetalle.get(i.detalle_pedido_id)?.modificaciones.push(i));
    const porPedido = new Map(pedidos.map(p => [p.id, { ...p, detalles: [] }]));
    for (const d of porDetalle.values()) porPedido.get(d.pedido_id)?.detalles.push(d);
    return [...porPedido.values()];
}

// Pedidos del cajero con saldo por cobrar, independientemente del estado de cocina.
async function listarPedidosPendientesPago(usuarioId) {
    if (!idValido(usuarioId)) {
        throw errorValidacion('Usuario inválido.', 401);
    }

    const [pedidos] = await db.query(`
        SELECT pe.id, pe.estado, pe.tipo_entrega, pe.nombre_referencia,
            pe.fecha_pedido, cli.nombre AS cliente_registrado,
            ROUND(COALESCE(v.total, 0), 2) AS total,
            COALESCE(pa.total_pagado, 0) AS total_pagado,
            ROUND(COALESCE(v.total, 0), 2) - COALESCE(pa.total_pagado, 0)
                AS saldo_pendiente
        FROM pedido pe
        JOIN servicio_contratado sc ON sc.id = pe.servicio_contratado_id
        JOIN operacion op ON op.id = sc.operacion_id
        LEFT JOIN clientes cli ON cli.id = op.cliente_id
        LEFT JOIN v_total_pedido v ON v.pedido_id = pe.id
        LEFT JOIN (
            SELECT servicio_contratado_id, SUM(importe) AS total_pagado
            FROM pago_aplicacion
            GROUP BY servicio_contratado_id
        ) pa ON pa.servicio_contratado_id = sc.id
        WHERE pe.usuario_id = ?
            AND pe.estado <> 'Cancelado'
            AND ROUND(COALESCE(v.total, 0), 2) > COALESCE(pa.total_pagado, 0)
        ORDER BY pe.fecha_pedido ASC, pe.id ASC
    `, [usuarioId]);

    return pedidos;
}

async function obtenerOrdenParaCobro(id, usuarioId) {
    if (!idValido(id) || !idValido(usuarioId)) {
        throw errorValidacion('Pedido o usuario inválido.');
    }
    const [filas] = await db.query(`
        SELECT pe.*, sc.id AS servicio_id, sc.operacion_id,
                      cli.nombre AS cliente_registrado,
                      COALESCE(v.total, 0) AS total,
                      COALESCE(pa.total_pagado, 0) AS total_pagado
        FROM pedido pe
        JOIN servicio_contratado sc ON sc.id = pe.servicio_contratado_id
        JOIN operacion op ON op.id = sc.operacion_id
        LEFT JOIN clientes cli ON cli.id = op.cliente_id
        LEFT JOIN v_total_pedido v ON v.pedido_id = pe.id
        LEFT JOIN (
            SELECT servicio_contratado_id, SUM(importe) AS total_pagado
            FROM pago_aplicacion GROUP BY servicio_contratado_id
        ) pa ON pa.servicio_contratado_id = sc.id
        WHERE pe.id = ? AND pe.usuario_id = ?
    `, [id, usuarioId]);
    if (!filas.length) throw errorValidacion('Pedido no encontrado para este cajero.', 404);

    const orden = filas[0];
    const referencia = String(orden.nombre_referencia || '');
    const mesa = orden.tipo_entrega === 'EN_LOCAL'
        ? referencia.match(/^Mesa\s+(\d+)(?:\s+-\s+.*)?$/i)
        : null;
    orden.numero_mesa = mesa ? mesa[1] : null;
    orden.nombre_cliente = orden.cliente_registrado || (
        orden.tipo_entrega === 'EN_LOCAL'
            ? (referencia.match(/^Mesa\s+\d+\s+-\s+(.+)$/i)?.[1] || null)
            : referencia || null
    );
    orden.saldo_pendiente = (
        Math.max(0, centavos(orden.total) - centavos(orden.total_pagado)) / 100
    ).toFixed(2);
    orden.estado_pago = Number(orden.saldo_pendiente) === 0 ? 'Pagado' : 'Pendiente';

    const [productos] = await db.query(`
        SELECT d.id, d.nombre_producto_historico AS nombre, d.cantidad,
                      d.precio_unitario AS precio, d.nota_cocina
        FROM detalle_pedido d
        WHERE d.pedido_id = ? ORDER BY d.id
    `, [id]);

    if (productos.length) {
        const ids = productos.map(p => p.id);
        const [ingredientes] = await db.query(`
            SELECT detalle_pedido_id, nombre_ingrediente_historico AS nombre,
                          accion, porciones, precio_extra_unitario
            FROM detalle_pedido_ingrediente
            WHERE detalle_pedido_id IN (?) ORDER BY id
        `, [ids]);
        const [opciones] = await db.query(`
            SELECT detalle_pedido_id, nombre_opcion_historico AS nombre,
                          ajuste_precio_unitario AS ajuste
            FROM detalle_pedido_opcion
            WHERE detalle_pedido_id IN (?) ORDER BY id
        `, [ids]);
        const porId = new Map(productos.map(p => [p.id, p]));
        for (const p of productos) {
            p.modificaciones = [];
            p.opciones = [];
            p.extras_unitarios = 0;
            p.opciones_unitarias = 0;
        }
        for (const ing of ingredientes) {
            const p = porId.get(ing.detalle_pedido_id);
            if (!p) continue;
            p.modificaciones.push(ing);
            if (ing.accion === 'EXTRA') {
                p.extras_unitarios += Number(ing.porciones) * Number(ing.precio_extra_unitario);
            }
        }
        for (const opc of opciones) {
            const p = porId.get(opc.detalle_pedido_id);
            if (!p) continue;
            p.opciones.push(opc);
            p.opciones_unitarias += Number(opc.ajuste);
        }
        for (const p of productos) {
            p.subtotal = (centavos(p.precio) + centavos(p.extras_unitarios) +
                centavos(p.opciones_unitarias)) * Number(p.cantidad) / 100;
        }
    }

    const [pagos] = await db.query(`
        SELECT pg.id, pg.fecha, pa.importe, mp.nombre AS metodo,
                      pg.referencia
        FROM pago_aplicacion pa
        JOIN pago pg ON pg.id = pa.pago_id
        JOIN metodo_pago mp ON mp.id = pg.metodo_pago_id
        WHERE pa.servicio_contratado_id = ?
        ORDER BY pg.fecha DESC, pg.id DESC
    `, [orden.servicio_id]);

    const [metodosPago] = await db.query(`
        SELECT id, codigo, nombre FROM metodo_pago ORDER BY id
    `);
    const [cajas, caja] = await Promise.all([
        TurnoCajaModel.listarCajasDisponibles(),
        TurnoCajaModel.consultarCaja(usuarioId)
    ]);
    const turno = caja ? { ...caja, id: caja.turno_id } : null;
    return { orden, productos, pagos, metodosPago, cajas, turno };
}

// La apertura se realiza en un solo modelo para ambos módulos.
async function abrirTurno(usuarioId, { caja_id, fondo_inicial }) {
    return TurnoCajaModel.abrirTurno(usuarioId, caja_id, fondo_inicial);
}

// Mantener el mismo orden de bloqueos que CancelacionesModel: operación y pedido.
async function bloquearOperacion(conn, pedidoId, usuarioId) {
    const [[referencia]] = await conn.query(`
        SELECT sc.operacion_id FROM pedido p
        JOIN servicio_contratado sc ON sc.id = p.servicio_contratado_id
        WHERE p.id = ? AND p.usuario_id = ?
    `, [pedidoId, usuarioId]);
    if (!referencia) throw errorValidacion('Pedido no encontrado para este cajero.', 404);
    await conn.query('SELECT id FROM operacion WHERE id = ? FOR UPDATE', [referencia.operacion_id]);
}

async function comprobarEditable(conn, pedidoId, usuarioId, bloquear = false) {
    const [[orden]] = await conn.query(`
        SELECT p.*, sc.operacion_id, op.cliente_id
        FROM pedido p
        JOIN servicio_contratado sc ON sc.id = p.servicio_contratado_id
        JOIN operacion op ON op.id = sc.operacion_id
        WHERE p.id = ? AND p.usuario_id = ? AND p.reservacion_id IS NULL
            AND p.tipo_entrega IN ('EN_LOCAL', 'PARA_LLEVAR')
        ${bloquear ? 'FOR UPDATE' : ''}
    `, [pedidoId, usuarioId]);
    if (!orden) throw errorValidacion('Pedido no encontrado para este cajero.', 404);
    if (orden.estado !== 'Enviado') {
        throw errorValidacion('Solo puedes modificar pedidos enviados que cocina aún no toma.', 409);
    }
    const [[operacion]] = await conn.query(`
        SELECT COUNT(*) AS servicios FROM servicio_contratado WHERE operacion_id = ?
    `, [orden.operacion_id]);
    if (Number(operacion.servicios) !== 1) {
        throw errorValidacion('Esta orden pertenece a una operación con otros servicios.', 409);
    }
    // El carrito actual no administra reservas ni opciones históricas; no perderlas.
    const [[protegido]] = await conn.query(`
        SELECT EXISTS(SELECT 1 FROM detalle_pedido d
            JOIN reserva_inventario r ON r.detalle_pedido_id = d.id WHERE d.pedido_id = ?) AS reservas,
            EXISTS(SELECT 1 FROM detalle_pedido d
            JOIN movimiento_inventario m ON m.detalle_pedido_id = d.id WHERE d.pedido_id = ?) AS movimientos,
            EXISTS(SELECT 1 FROM detalle_pedido d
            JOIN detalle_pedido_opcion o ON o.detalle_pedido_id = d.id WHERE d.pedido_id = ?) AS opciones
    `, [pedidoId, pedidoId, pedidoId]);
    if (protegido.reservas || protegido.movimientos || protegido.opciones) {
        throw errorValidacion('La orden contiene inventario u opciones que este editor no puede modificar.', 409);
    }
    return orden;
}

async function obtenerOrdenParaEditar(pedidoId, usuarioId, catalogo) {
    if (!idValido(pedidoId) || !idValido(usuarioId)) throw errorValidacion('Pedido inválido.');
    const conn = await db.getConnection();
    try {
        await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await conn.beginTransaction();
        const orden = await comprobarEditable(conn, pedidoId, usuarioId);
        const [detalles] = await conn.query(`
            SELECT id, producto_id, cantidad, nota_cocina FROM detalle_pedido
            WHERE pedido_id = ? ORDER BY id
        `, [pedidoId]);
        const [cambios] = detalles.length ? await conn.query(`
            SELECT detalle_pedido_id, ingrediente_id, accion, porciones
            FROM detalle_pedido_ingrediente WHERE detalle_pedido_id IN (?)
            AND accion IN ('QUITADO', 'EXTRA') ORDER BY id
        `, [detalles.map(d => d.id)]) : [[]];
        const items = detalles.map(d => {
            const producto = catalogo.find(p => Number(p.id) === Number(d.producto_id));
            if (!producto || !producto.ingredientes.length) {
                throw errorValidacion('Un platillo ya no está disponible; no se puede cargar la orden completa.', 409);
            }
            const modificaciones = cambios.filter(c => c.detalle_pedido_id === d.id).map(c => {
                const tipo = c.accion === 'QUITADO' ? 'REMOVIBLE' : 'EXTRA';
                const ing = producto.ingredientes.find(i => i.ingrediente_id === c.ingrediente_id && i.tipo === tipo);
                if (!ing || (tipo === 'EXTRA' && Number(c.porciones) > Number(ing.max_porciones_extra))) {
                    throw errorValidacion('La receta cambió y no se puede recuperar una personalización de la orden.', 409);
                }
                return { platillo_ingrediente_id: ing.platillo_ingrediente_id,
                    accion: c.accion === 'QUITADO' ? 'QUITAR' : 'EXTRA', porciones: c.porciones };
            });
            return { id: Number(d.producto_id), cantidad: Number(d.cantidad),
                nota_cocina: d.nota_cocina || '', modificaciones };
        });
        const referencia = String(orden.nombre_referencia || '');
        const mesa = referencia.match(/^Mesa\s+(\d+)(?:\s*-\s*(.*))?$/i);
        await conn.commit();
        return { id: orden.id, version: orden.version, items,
            tipo_orden: orden.tipo_entrega === 'EN_LOCAL' ? 'Mesa' : 'Para llevar',
            numero_mesa: mesa?.[1] || '',
            nombre_cliente: orden.tipo_entrega === 'EN_LOCAL' ? (mesa?.[2] || '') : referencia,
            nota: orden.nota || '' };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

async function modificarOrden(pedidoId, usuarioId, datos) {
    if (!idValido(pedidoId) || !idValido(usuarioId) || !idValido(datos.version)) {
        throw errorValidacion('Pedido o versión inválidos.');
    }
    const { items, tipo, referencia, nota, nombreCliente } = normalizarPedido(datos);
    const conn = await db.getConnection();
    try {
        await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await conn.beginTransaction();
        await bloquearOperacion(conn, pedidoId, usuarioId);
        const orden = await comprobarEditable(conn, pedidoId, usuarioId, true);
        if (Number(orden.version) !== Number(datos.version)) {
            throw errorValidacion('La orden cambió. Vuelve a abrirla antes de guardar.', 409);
        }
        const { lineas, totalCentavos } = await prepararLineas(conn, items);
        const [[pago]] = await conn.query(`
            SELECT COALESCE(SUM(importe), 0) AS pagado FROM pago_aplicacion
            WHERE servicio_contratado_id = ?
        `, [orden.servicio_contratado_id]);
        if (totalCentavos < centavos(pago.pagado)) {
            throw errorValidacion('El nuevo total es menor que lo pagado. Se necesita gestionar una devolución antes de modificar.', 409);
        }
        // No alterar datos de un cliente que pueda estar asociado a otras operaciones.
        let clienteId = orden.cliente_id;
        if (nombreCliente) {
            const [[cliente]] = clienteId ? await conn.query('SELECT nombre FROM clientes WHERE id = ?', [clienteId]) : [[]];
            if (!cliente || cliente.nombre !== nombreCliente) {
                const [nuevo] = await conn.query('INSERT INTO clientes (nombre) VALUES (?)', [nombreCliente]);
                clienteId = nuevo.insertId;
            }
        } else {
            clienteId = null;
        }
        await conn.query('UPDATE operacion SET cliente_id = ?, observaciones = ? WHERE id = ?',
            [clienteId, nota || null, orden.operacion_id]);
        await conn.query('DELETE FROM detalle_pedido WHERE pedido_id = ?', [pedidoId]);
        await insertarLineas(conn, pedidoId, lineas);
        await conn.query(`UPDATE pedido SET tipo_entrega = ?, nombre_referencia = ?, nota = ?,
            version = version + 1 WHERE id = ?`, [tipo, referencia, nota || null, pedidoId]);
        await conn.commit();
        return { id: Number(pedidoId), total: (totalCentavos / 100).toFixed(2) };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

// Registrar exactamente el saldo pendiente: sin aceptar importes/precios del navegador.
async function registrarPagoCompleto(pedidoId, usuarioId, metodoId, referencia, version) {
    if (!idValido(pedidoId) || !idValido(usuarioId) || !idValido(metodoId) || !idValido(version)) {
        throw errorValidacion('Pedido, usuario o método de pago inválido.');
    }
    if (typeof referencia !== 'string' || referencia.length > 120) {
        throw errorValidacion('La referencia del pago es demasiado larga.');
    }
    const conn = await db.getConnection();
    try {
        await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await conn.beginTransaction();
        await bloquearOperacion(conn, pedidoId, usuarioId);
        // Bloquear este pedido antes de leer el saldo para evitar cobros dobles.
        const [filas] = await conn.query(`
            SELECT pe.id, pe.estado, pe.version, sc.id AS servicio_id, sc.operacion_id
            FROM pedido pe
            JOIN servicio_contratado sc ON sc.id = pe.servicio_contratado_id
            WHERE pe.id = ? AND pe.usuario_id = ?
            FOR UPDATE
        `, [pedidoId, usuarioId]);
        if (!filas.length) throw errorValidacion('Pedido no encontrado para este cajero.', 404);
        const orden = filas[0];
        if (orden.estado === 'Cancelado') {
            throw errorValidacion('No se puede cobrar un pedido cancelado.', 409);
        }
        if (Number(orden.version) !== Number(version)) {
            throw errorValidacion('La orden fue modificada. Revisa el nuevo total antes de cobrar.', 409);
        }
        const [metodos] = await conn.query(
            'SELECT id FROM metodo_pago WHERE id = ?', [metodoId]
        );
        if (!metodos.length) throw errorValidacion('Método de pago no válido.');
        const [turnos] = await conn.query(`
            SELECT t.id FROM turno_caja t
            JOIN caja c ON c.id = t.caja_id AND c.activo = 1
            WHERE t.usuario_id = ? AND t.cierre IS NULL
            ORDER BY t.apertura DESC LIMIT 1 FOR UPDATE
        `, [usuarioId]);
        if (!turnos.length) throw errorValidacion('Abre un turno de caja antes de cobrar.', 409);

        const [totales] = await conn.query(
            'SELECT COALESCE(total, 0) AS total FROM v_total_pedido WHERE pedido_id = ?',
            [pedidoId]
        );
        const [[anterior]] = await conn.query(`
            SELECT COALESCE(SUM(importe), 0) AS pagado
            FROM pago_aplicacion WHERE servicio_contratado_id = ?
        `, [orden.servicio_id]);
        const total = centavos(totales[0]?.total || 0);
        const pagado = centavos(anterior.pagado);
        const pendiente = total - pagado;
        if (pendiente <= 0) throw errorValidacion('La orden ya está pagada o su total es cero.', 409);

        const concepto = pagado > 0 ? 'SALDO' : 'TOTAL';
        const [conceptos] = await conn.query(
            'SELECT id FROM concepto_pago WHERE codigo = ?', [concepto]
        );
        if (!conceptos.length) throw errorValidacion(`Falta el concepto de pago ${concepto}.`, 500);
        const importe = (pendiente / 100).toFixed(2);
        const [pago] = await conn.query(`
            INSERT INTO pago
                (operacion_id, metodo_pago_id, turno_caja_id, usuario_id, importe, referencia)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [orden.operacion_id, metodoId, turnos[0].id, usuarioId,
                importe, referencia.trim() || null]);
        await conn.query(`
            INSERT INTO pago_aplicacion
                (pago_id, servicio_contratado_id, concepto_pago_id, importe)
            VALUES (?, ?, ?, ?)
        `, [pago.insertId, orden.servicio_id, conceptos[0].id, importe]);
        await conn.commit();
        return pago.insertId;
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

// Cancelar se gestiona exclusivamente en CancelacionesModel.
// La autorización por rol se realiza desde las rutas/middlewares.
async function actualizarEstado(id, nuevoEstado, version) {
    if (!idValido(id)) throw errorValidacion('Pedido inválido.');
    const transiciones = {
        Enviado: ['Orden tomada'],
        'Orden tomada': ['Listo para entregar'],
        'Listo para entregar': ['Entregado']
    };
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [filas] = await conn.query('SELECT estado, version FROM pedido WHERE id = ? FOR UPDATE', [id]);
        if (!filas.length) throw errorValidacion('Pedido no encontrado.', 404);
        if (!(transiciones[filas[0].estado] || []).includes(nuevoEstado)) {
            throw errorValidacion('Transición de estado no permitida.', 409);
        }
        if (nuevoEstado === 'Orden tomada' && (!idValido(version) || Number(version) !== Number(filas[0].version))) {
            throw errorValidacion('La comanda cambió. Actualiza cocina y revisa los platillos antes de tomarla.', 409);
        }
        await conn.query(`
            UPDATE pedido SET estado = ?,
                fecha_entrega = CASE WHEN ? = 'Entregado' THEN NOW() ELSE fecha_entrega END
            WHERE id = ?
        `, [nuevoEstado, nuevoEstado, id]);
        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

module.exports = {
    listarProductosCaja,
    crearOrden,
    obtenerOrdenParaEditar,
    modificarOrden,
    listarPedidos,
    listarPedidosPendientesPago,
    obtenerOrdenParaCobro,
    abrirTurno,
    registrarPagoCompleto,
    actualizarEstado
};
