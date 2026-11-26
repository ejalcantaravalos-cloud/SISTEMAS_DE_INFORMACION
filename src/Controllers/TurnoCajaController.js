'use strict';

const TurnoCajaModel = require('../models/TurnoCajaModel');

const mensajes = Object.freeze({
    abierto: 'Turno abierto correctamente. Ya puedes registrar cobros.',
    cerrado: 'Corte registrado y turno cerrado correctamente.',
    sin_turno: 'No hay un turno abierto que puedas cerrar.',
    turno_ajeno: 'Solo puede cerrar el turno quien lo abrio. No se modifico la caja.',
    ya_abierto: 'Ya tienes una caja abierta. No se creó otro turno.',
    caja_inexistente: 'La caja seleccionada no existe o está deshabilitada.',
    caja_ocupada: 'La caja ya está ocupada. Selecciona otra disponible.',
    corte_invalido: 'Introduce el efectivo contado y verifica los datos del turno.',
    fondo_invalido: 'Introduce un fondo inicial válido (ejemplo: 500.00).',
    finalizada: 'La reservación fue marcada como Finalizada.',
    no_finalizada: 'No se pudo finalizar: el evento quizá no ha terminado, ya fue finalizado o fue cancelado.',
    id_invalido: 'Identificador de reservación inválido.',
    liquidada: '¡Pago final registrado! La reservación quedó liquidada.',
    sin_turno_pago: 'Debes abrir tu propio turno para registrar el pago final.',
    sin_saldo: 'Esta reservación ya está liquidada o no tiene saldo pendiente.',
    reserva_no_valida: 'La reservación no existe o está cancelada.',
    metodo_invalido: 'Selecciona un método de pago válido.',
    catalogo_incompleto: 'Falta configurar el método de pago o el concepto SALDO en MySQL.',
    referencia_invalida: 'La referencia no puede superar 120 caracteres.'
});

function idAutenticado(req) {
    const id = Number(req.user?.id ?? req.user?.id_usuario);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parsearFondo(valor) {
    const texto = String(valor ?? '').trim();
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(texto)) return null;
    const fondo = Number(texto);
    if (!Number.isFinite(fondo) || fondo > 9999999999.99) return null;
    return fondo.toFixed(2);
}

exports.menu = async (req, res, next) => {
    try {
        const usuarioId = idAutenticado(req);
        if (!usuarioId) return res.sendStatus(401);
        const [caja, cajas, reservaciones, saldos] = await Promise.all([
            TurnoCajaModel.consultarCaja(usuarioId),
            TurnoCajaModel.listarCajasDisponibles(),
            TurnoCajaModel.listarReservacionesPorFinalizar(),
            TurnoCajaModel.listarSaldosPendientes()
        ]);

        const resumen = caja ? await TurnoCajaModel.consultarResumen(caja.turno_id) : null;
        const codigo = String(req.query.mensaje || '');
        return res.render('vistaMenuRentas', {
            user: req.user,
            caja,
            cajas,
            resumen,
            reservaciones,
            saldos,
            mensaje: mensajes[codigo] || null,
            esError: !['abierto', 'cerrado', 'finalizada', 'liquidada'].includes(codigo)
        });
    } catch (error) {
        next(error);
    }
};

exports.abrir = async (req, res, next) => {
    try {
        const usuarioId = idAutenticado(req);
        if (!usuarioId) return res.sendStatus(401);

        const fondo = parsearFondo(req.body.fondo_inicial);
        if (fondo === null) return res.redirect('/rentas?mensaje=fondo_invalido');

        await TurnoCajaModel.abrirTurno(usuarioId, req.body.caja_id, fondo);
        return res.redirect('/rentas?mensaje=abierto');
    } catch (error) {
        if (error.codigo === 'CAJA_OCUPADA') {
            return res.redirect('/rentas?mensaje=caja_ocupada');
        }
        if (error.codigo === 'YA_ABIERTO') {
            return res.redirect('/rentas?mensaje=ya_abierto');
        }
        if (error.codigo === 'CAJA_NO_EXISTE') {
            return res.redirect('/rentas?mensaje=caja_inexistente');
        }
        next(error);
    }
};

exports.cerrar = async (req, res, next) => {
    try {
        const usuarioId = idAutenticado(req);
        if (!usuarioId) return res.sendStatus(401);

        await TurnoCajaModel.cerrarTurno(
            usuarioId, req.body.turno_id, req.body.efectivo_contado,
            req.body.observaciones || ''
        );
        return res.redirect('/rentas?mensaje=cerrado');
    } catch (error) {
        if (error.codigo === 'CORTE_INVALIDO') {
            return res.redirect('/rentas?mensaje=corte_invalido');
        }
        if (error.codigo === 'SIN_TURNO') {
            return res.redirect('/rentas?mensaje=sin_turno');
        }
        if (error.codigo === 'TURNO_AJENO') {
            return res.redirect('/rentas?mensaje=turno_ajeno');
        }
        if (error.codigo === 'CAJA_NO_EXISTE') {
            return res.redirect('/rentas?mensaje=caja_inexistente');
        }
        next(error);
    }
};

exports.finalizar = async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.redirect('/rentas?mensaje=id_invalido');
        }

        const modificado = await TurnoCajaModel.finalizarReservacion(id);
        return res.redirect(
            modificado
                ? '/rentas?mensaje=finalizada'
                : '/rentas?mensaje=no_finalizada'
        );
    } catch (error) {
        next(error);
    }
};


exports.liquidar = async (req, res, next) => {
    try {
        const usuarioId = idAutenticado(req);
        if (!usuarioId) return res.sendStatus(401);

        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.redirect('/rentas?mensaje=id_invalido');
        }

        const metodo = String(req.body.metodo_pago || '').trim().toUpperCase();
        const referencia = String(req.body.referencia || '').trim();
        if (referencia.length > 120) {
            return res.redirect('/rentas?mensaje=referencia_invalida');
        }

        await TurnoCajaModel.liquidarSaldo(id, usuarioId, metodo, referencia);
        return res.redirect('/rentas?mensaje=liquidada');
    } catch (error) {
        const codigos = {
            SIN_TURNO_PROPIO: 'sin_turno_pago',
            SIN_SALDO: 'sin_saldo',
            RESERVA_NO_VALIDA: 'reserva_no_valida',
            METODO_INVALIDO: 'metodo_invalido',
            CATALOGO_INCOMPLETO: 'catalogo_incompleto'
        };
        if (error.codigo && codigos[error.codigo]) {
            return res.redirect('/rentas?mensaje=' + codigos[error.codigo]);
        }
        return next(error);
    }
};
