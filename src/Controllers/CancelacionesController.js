const Model = require('../models/CancelacionesModel');
const Motivos = require('../utils/MotivosCancelacion');
const Avisos = require('../utils/Avisos');

const AREAS = {
    eventos: {
        titulo: 'Cancelaciones y reagendaciones de eventos',
        ruta: '/rentas/cancelaciones/eventos',
        regreso: '/rentas/eventos'
    },
    inflables: {
        titulo: 'Cancelaciones y reagendaciones de inflables',
        ruta: '/rentas/cancelaciones/inflables',
        regreso: '/rentas/gestion/inflables'
    },
    restaurante: {
        titulo: 'Cancelaciones de restaurante',
        ruta: '/restaurante/cancelaciones',
        regreso: '/ordenes/pedidos'
    }
};

// ========================================
// VALIDACIONES DEL FORMULARIO
// ========================================

function exigir(condicion, mensaje) {
    if (!condicion) {
        const error = new Error(mensaje);
        error.status = 400;
        throw error;
    }
}

function validarId(valor) {
    const numero = Number(valor);
    exigir(/^\d+$/.test(String(valor)) && Number.isSafeInteger(numero)
        && numero > 0 && numero <= 2147483647, 'Identificador inválido.');
    return numero;
}

function prepararDatos(area, body = {}) {
    const responsable = body.responsable;
    exigir(['cliente', 'negocio'].includes(responsable), 'Selecciona al responsable.');

    const permitidos = responsable === 'cliente'
        ? Motivos.cliente
        : Motivos.negocio[area];

    const seleccion = Array.isArray(body.motivos)
        ? body.motivos
        : body.motivos ? [body.motivos] : [];

    exigir(seleccion.length > 0 && seleccion.every(m => permitidos.includes(m)),
        'Selecciona al menos un motivo válido.');

    const motivos = [...new Set(seleccion)];
    const explicacion = typeof body.explicacion === 'string'
        ? body.explicacion.trim() : '';

    exigir(explicacion.length <= 1500, 'La explicación no puede superar 1500 caracteres.');
    exigir((responsable !== 'negocio' && !motivos.includes('Otro motivo')) || explicacion.length > 0,
        'Escribe una explicación de lo ocurrido.');
    exigir(body.confirmar === '1', 'Confirma la operación.');

    const reagendar = body.reagendar === '1';
    exigir(body.reagendar === undefined || reagendar, 'Acción inválida.');
    exigir(!reagendar || area !== 'restaurante', 'Los pedidos de comida no se pueden reagendar.');

    if (reagendar) {
        exigir(typeof body.nueva_fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.nueva_fecha),
            'Selecciona la nueva fecha.');
        const fecha = new Date(body.nueva_fecha + 'T00:00:00Z');
        exigir(Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === body.nueva_fecha,
            'La nueva fecha no es válida.');
        exigir(area !== 'eventos' || (typeof body.nueva_hora === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.nueva_hora)),
            'Selecciona la nueva hora de inicio.');
        exigir(typeof body.inicio_original === 'string' && typeof body.fin_original === 'string',
            'Actualiza la lista antes de reagendar.');
    }

    return {
        responsable, motivos, explicacion, reagendar,
        fecha: body.nueva_fecha, hora: body.nueva_hora,
        inicioOriginal: body.inicio_original, finOriginal: body.fin_original
    };
}

// ========================================
// CONTROLADOR REUTILIZABLE POR ÁREA
// ========================================

class CancelacionesController {
    static async listar(area, req, res, errorVisible = null) {
        try {
            const registros = await Model.listar(area);
            const historialReagendaciones = area === 'restaurante' ? [] : await Model.historialReagendaciones(area);
            if (area === 'restaurante' && req.query.pedido &&
                !registros.some(r => String(r.id) === String(req.query.pedido) && r.cancelable)) {
                errorVisible = 'El pedido ya no está disponible para cancelar. Revisa su estado.';
            }
            const mensajes = Avisos.obtener(req, {
                cancelado: 'Servicio cancelado correctamente. No se realizó una devolución de dinero.',
                devolucion_pendiente: 'Cancelación registrada. Solicitud de devolución pendiente.',
                reagendado: 'Reservación reagendada correctamente. Se conservaron los pagos.',
                reagendado_cliente: 'Reservación reagendada. Consulta el apartado retenido y el saldo pendiente en el historial.',
                anticipo_reagendado: 'Nuevo anticipo registrado correctamente en tu turno de caja.'
            });

            return res.status(errorVisible ? 400 : 200).render('CancelacionesServicios', {
                user: req.user,
                area,
                ...AREAS[area],
                registros,
                historialReagendaciones,
                motivosCliente: Motivos.cliente,
                motivosNegocio: Motivos.negocio[area],
                ...mensajes,
                ...(errorVisible ? { aviso: errorVisible, tipoAviso: 'error' } : {})
            });
        } catch (error) {
            console.error('CANCELACIONES:', error);
            return res.status(500).render('CancelacionesServicios', {
                user: req.user,
                area,
                ...AREAS[area],
                registros: [],
                historialReagendaciones: [],
                motivosCliente: Motivos.cliente,
                motivosNegocio: Motivos.negocio[area],
                aviso: 'No se pudieron consultar los servicios. Revisa Docker.',
                tipoAviso: 'error'
            });
        }
    }

    static async cobrarAnticipo(area, req, res) {
        try {
            const usuarioId = validarId(req.user?.id ?? req.user?.usuario_id);
            const id = validarId(req.params.id);
            const body = req.body || {};
            exigir(area !== 'restaurante', 'Los pedidos no admiten reagendación.');
            exigir(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].includes(body.metodo_pago), 'Selecciona un método de pago.');
            exigir(typeof body.importe_esperado === 'string' && /^\d{1,10}(\.\d{1,2})?$/.test(body.importe_esperado),
                'El importe no es válido. Actualiza la lista.');
            exigir(body.confirmar_pago === '1', 'Confirma que recibiste el dinero.');
            const referencia = typeof body.referencia === 'string' ? body.referencia.trim() : '';
            exigir(referencia.length <= 120, 'La referencia no puede superar 120 caracteres.');
            await Model.cobrarAnticipo(area, id, {
                metodo: body.metodo_pago, importeEsperado: body.importe_esperado, referencia
            }, usuarioId);
            return Avisos.exito(res, AREAS[area].ruta, 'anticipo_reagendado');
        } catch (error) {
            console.error('ANTICIPO REAGENDACIÓN:', error);
            return CancelacionesController.listar(area, req, res, [400, 404, 409].includes(error.status)
                ? error.message : 'No se pudo registrar el pago. No se guardaron los cambios.');
        }
    }

    static async cancelar(area, req, res) {
        try {
            const usuarioId = validarId(req.user?.id ?? req.user?.usuario_id);
            const id = validarId(req.params.id);
            const datos = prepararDatos(area, req.body);
            if (datos.reagendar) {
                await Model.reagendar(area, id, datos, usuarioId);
                return Avisos.exito(res, AREAS[area].ruta,
                    datos.responsable === 'cliente' ? 'reagendado_cliente' : 'reagendado');
            }
            const resultado = await Model.cancelar(area, id, datos, usuarioId);

            const aviso = resultado.solicitudes > 0
                ? 'devolucion_pendiente' : 'cancelado';

            return Avisos.exito(res, AREAS[area].ruta, aviso);
        } catch (error) {
            console.error('CANCELACIONES:', error);
            const mensaje = [400, 404, 409].includes(error.status)
                ? error.message
                : 'No se pudo completar la operación. Los cambios no se guardaron. Revisa Docker.';

            return CancelacionesController.listar(area, req, res, mensaje);
        }
    }
}

module.exports = CancelacionesController;
