
'use strict';

const LimpiezaInflablesModel = require('../models/LimpiezaInflablesModel');

const RESULTADOS = new Set([
    'DISPONIBLE',
    'REQUIERE_LIMPIEZA',
    'MANTENIMIENTO',
    'FUERA_SERVICIO'
]);

// ==========================================
// MOSTRAR PANTALLA DE LIMPIEZA
// ==========================================

exports.inicio = async (req, res, next) => {

    try {

        const inflables =
            await LimpiezaInflablesModel.listar();

        const aviso =
            req.query.aviso === 'guardado'
                ? 'Revisión registrada correctamente.'
                : null;

        return res.render('VistaLimpiezaInflables', {
            user: req.user,
            inflables,
            aviso
        });

    } catch (error) {

        console.error(
            'Error al consultar inflables:',
            error
        );

        return next(error);
    }
};

// ==========================================
// GUARDAR RESULTADO DE REVISIÓN
// ==========================================

exports.registrarRevision = async (req, res, next) => {

    try {

        const inflableId = Number(req.params.id);

        const usuarioId = Number(
            req.user?.id ?? req.user?.id_usuario
        );

        const resultado = String(
            req.body.resultado || ''
        ).trim();

        const observaciones = String(
            req.body.observaciones || ''
        ).trim();

        // Validar usuario
        if (
            !Number.isSafeInteger(usuarioId) ||
            usuarioId <= 0
        ) {
            return res.sendStatus(401);
        }

        // Validar inflable
        if (
            !Number.isSafeInteger(inflableId) ||
            inflableId <= 0
        ) {
            return res.status(400).send(
                'ID de inflable inválido.'
            );
        }

        // Validar resultado
        if (!RESULTADOS.has(resultado)) {
            return res.status(400).send(
                'Resultado de revisión inválido.'
            );
        }

        // Validar observaciones
        if (observaciones.length > 2000) {
            return res.status(400).send(
                'Las observaciones son demasiado largas.'
            );
        }

        // Registrar revisión
        await LimpiezaInflablesModel.registrar({
            inflableId,
            usuarioId,
            resultado,
            observaciones
        });

        // Regresar a la vista
        return res.redirect(
            '/limpieza/inflables?aviso=guardado'
        );

    } catch (error) {

        if (error.codigo === 'NO_EXISTE') {
            return res.status(404).send(error.message);
        }

        console.error(
            'Error al registrar revisión:',
            error
        );

        return next(error);
    }
};
