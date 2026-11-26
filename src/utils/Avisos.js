class Avisos {

    // MENSAJES GENERALES DEL SISTEMA

    static mensajes = {

        creado: 'Registro creado correctamente.',

        actualizado: 'Cambios guardados correctamente.',

        estado_actualizado: 'Estado actualizado correctamente.',

        imagen_eliminada: 'Fotografía eliminada correctamente.',

        eliminado: 'Registro eliminado correctamente.',

        error_datos: 'Revisa los datos ingresados.',

        error_no_encontrado: 'No se encontró el registro.',

        error_conflicto: 'El registro fue modificado. Inténtalo nuevamente.',

        error_operacion: 'No se pudo completar la operación.',

        error_imagen: 'La fotografía no es válida o supera los 5 MB.'

    };


    // OBTENER MENSAJE PARA LA VISTA

    static obtener(req, personalizados = {}) {

        const codigo = String(req.query.aviso || '');

        const mensajes = {
            ...Avisos.mensajes,
            ...personalizados
        };

        const aviso = Object.prototype.hasOwnProperty.call(
            mensajes,
            codigo
        ) ? mensajes[codigo] : null;

        return {
            aviso,

            tipoAviso: codigo.startsWith('error_')
                ? 'error'
                : 'exito'
        };

    }


    // REDIRIGIR DESPUÉS DE UNA OPERACIÓN

    static exito(res, ruta, codigo = 'creado') {

        return res.redirect(
            303,
            `${ruta}?aviso=${encodeURIComponent(codigo)}`
        );

    }


    // MANEJAR ERRORES DE FORMULARIOS

    static error(res, error, ruta) {

        console.error(error);

        const codigos = {
            400: 'error_datos',
            404: 'error_no_encontrado',
            409: 'error_conflicto'
        };

        const codigo = codigos[error.status]
            || 'error_operacion';

        return res.redirect(
            303,
            `${ruta}?aviso=${codigo}`
        );

    }

}

module.exports = Avisos;