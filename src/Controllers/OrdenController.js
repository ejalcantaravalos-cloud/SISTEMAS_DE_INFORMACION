'use strict';

const OrdenModel = require('../models/OrdenModel');
const Avisos = require('../utils/Avisos');

const mensajes = {
    orden_enviada: 'Orden enviada correctamente a cocina.',
    orden_modificada: 'Orden modificada correctamente.',
    pago_registrado: 'El pago quedó registrado correctamente.',
    turno_abierto: 'Turno de caja abierto correctamente.',
    error_conflicto: 'La orden cambió de estado o no se puede realizar esta operación.',
    error_edicion: 'La orden ya no se puede editar o tiene platillos, recetas u opciones que no están disponibles en el editor.'
};

function responderError(error, res) {
    console.error('Error de órdenes:', error);
    const status = error.status || 500;
    return res.status(status).json({
        error: status === 500 ? 'Error interno al procesar la orden.' : error.message
    });
}

// GET: mostrar platillos con sus ingredientes configurados.
exports.mostrarCaja = async (req, res) => {
    try {
        const productos = await OrdenModel.listarProductosCaja();
        return res.render('VistaCajero', { user: req.user, productos, edicion: null, ...Avisos.obtener(req, mensajes) });
    } catch (error) {
        console.error('Error al mostrar caja:', error);
        return res.status(500).render('VistaCajero', { user: req.user, productos: [], edicion: null, aviso: 'No se pudieron consultar los platillos.', tipoAviso: 'error' });
    }
};

// POST: registrar un pedido. Acepta `detalles` como JSON serializado o como arreglo.
exports.crearOrden = async (req, res) => {
    try {
        const resultado = await OrdenModel.crearOrden(req.user.id, req.body);

        // Si la vista usa fetch, devolver datos sin navegación automática.
        if ((req.get('Accept') || '').includes('application/json')) {
            return res.status(201).json({
                ok: true,
                pedido_id: resultado.id,
                total: resultado.total,
                redirect: `/ordenes/cobro/${resultado.id}`
            });
        }

        // Para un formulario HTML tradicional.
        return Avisos.exito(res, `/ordenes/cobro/${resultado.id}`, 'orden_enviada');
    } catch (error) {
        if ((req.get('Accept') || '').includes('application/json')) return responderError(error, res);
        return Avisos.error(res, error, '/ordenes/caja');
    }
};

exports.mostrarEdicion = async (req, res) => {
    try {
        const productos = await OrdenModel.listarProductosCaja();
        const edicion = await OrdenModel.obtenerOrdenParaEditar(req.params.id, req.user.id, productos);
        return res.render('VistaCajero', { user: req.user, productos, edicion, ...Avisos.obtener(req, mensajes) });
    } catch (error) {
        if (error.status === 409) {
            console.error(error);
            return res.redirect(303, '/ordenes/pedidos?aviso=error_edicion');
        }
        return Avisos.error(res, error, '/ordenes/pedidos');
    }
};

exports.modificarOrden = async (req, res) => {
    try {
        const resultado = await OrdenModel.modificarOrden(req.params.id, req.user.id, req.body);
        const destino = `/ordenes/cobro/${resultado.id}`;
        if ((req.get('Accept') || '').includes('application/json')) {
            return res.json({ ok: true, pedido_id: resultado.id, total: resultado.total, redirect: `${destino}?aviso=orden_modificada` });
        }
        return Avisos.exito(res, destino, 'orden_modificada');
    } catch (error) {
        if ((req.get('Accept') || '').includes('application/json')) return responderError(error, res);
        return Avisos.error(res, error, '/ordenes/pedidos');
    }
};

// GET: listado de pedidos con componentes de cocina.
exports.listarPedidos = async (req, res) => {
    try {
        const pedidos = await OrdenModel.listarPedidos();
        return res.render('PedidoRegistro', { user: req.user, pedidos, ...Avisos.obtener(req, mensajes) });
    } catch (error) {
        console.error('Error al listar pedidos:', error);
        return res.status(500).render('PedidoRegistro', { user: req.user, pedidos: [], aviso: 'No se pudieron consultar los pedidos.', tipoAviso: 'error' });
    }
};

// GET: pedidos del cajero que todavía tienen saldo pendiente.
exports.listarPendientesPago = async (req, res) => {
    try {
        const pedidos = await OrdenModel.listarPedidosPendientesPago(req.user.id);

        return res.render('PedidosPendientesPago', {
            user: req.user,
            pedidos,
            errorConsulta: false,
            ...Avisos.obtener(req, mensajes)
        });
    } catch (error) {
        console.error('Error al consultar pedidos pendientes de pago:', error);

        return res.status(500).render('PedidosPendientesPago', {
            user: req.user,
            pedidos: [],
            errorConsulta: true,
            aviso: 'No se pudieron consultar los pedidos pendientes de pago.',
            tipoAviso: 'error'
        });
    }
};

// GET: detalle, nombre, extras, historial y métodos de pago.
exports.mostrarCobro = async (req, res) => {
    try {
        const datos = await OrdenModel.obtenerOrdenParaCobro(
            req.params.id, req.user.id
        );
        return res.render('cobro', {
            user: req.user,
            ...datos,
            ...Avisos.obtener(req, mensajes)
        });
    } catch (error) {
        console.error('Error al mostrar cobro:', error);
        return Avisos.error(res, error, '/ordenes/pedidos');
    }
};

function redirigirConError(res, pedidoId, error) {
    const destino = Number.isSafeInteger(pedidoId) && pedidoId > 0
        ? `/ordenes/cobro/${pedidoId}` : '/ordenes/pedidos';
    return Avisos.error(res, error, destino);
}

// POST: abrir turno de caja si el usuario no tiene uno.
exports.abrirTurno = async (req, res) => {
    const pedidoId = Number(req.body.pedido_id);
    try {
        if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) {
            return Avisos.error(res, { status: 400 }, '/ordenes/pedidos');
        }
        // Comprobar que es una orden a la que el cajero puede acceder.
        await OrdenModel.obtenerOrdenParaCobro(pedidoId, req.user.id);
        await OrdenModel.abrirTurno(req.user.id, req.body);
        return Avisos.exito(res, `/ordenes/cobro/${pedidoId}`, 'turno_abierto');
    } catch (error) {
        return redirigirConError(res, pedidoId, error);
    }
};

// POST: registrar un pago real, vinculado a la operación y al turno.
exports.registrarPago = async (req, res) => {
    const pedidoId = Number(req.params.id);
    try {
        await OrdenModel.registrarPagoCompleto(
            pedidoId,
            req.user.id,
            req.body.metodo_pago_id,
            req.body.referencia || '',
            req.body.version
        );
        return Avisos.exito(res, `/ordenes/cobro/${pedidoId}`, 'pago_registrado');
    } catch (error) {
        return redirigirConError(res, pedidoId, error);
    }
};

// POST: cocina/meseros pueden avanzar el estado del pedido.
// Proteger la ruta correspondiente con hasRole(['Cocina', 'Mesero'])
// y comprobar que el rol pueda realizar ESA transición.
exports.actualizarEstado = async (req, res) => {
    try {
        const nuevoEstado = req.body.estado;
        const roles = req.user?.roles || [];
        const esCocina = roles.includes('Cocina');
        const esMesero = roles.includes('Mesero');
        const esAdmin = roles.includes('Administrador');

        if (['Orden tomada', 'Listo para entregar'].includes(nuevoEstado) && !(esCocina || esAdmin)) {
            return res.status(403).json({ error: 'Solo cocina puede completar pedidos.' });
        }
        if (nuevoEstado === 'Entregado' && !(esMesero || esAdmin)) {
            return res.status(403).json({ error: 'Solo meseros pueden entregar pedidos.' });
        }
        if (!['Orden tomada', 'Listo para entregar', 'Entregado'].includes(nuevoEstado)) {
            return res.status(400).json({ error: 'Estado no permitido.' });
        }

        await OrdenModel.actualizarEstado(req.params.id, nuevoEstado, req.body.version);
        return res.json({ ok: true, estado: nuevoEstado });
    } catch (error) {
        return responderError(error, res);
    }
};
