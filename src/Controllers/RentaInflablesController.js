
const RentaInflablesModel = require('../models/RentaInflablesModel');
const cloudinary = require('../Database/Cloudinary');
const { randomUUID } = require('node:crypto');

function errorHttp(mensaje, status = 400) {
    const error = new Error(mensaje);
    error.status = status;
    return error;
}

function enteroPositivo(valor) {
    const numero = Number(valor);

    if (
        !Number.isSafeInteger(numero) ||
        numero < 1
    ) {
        throw errorHttp('Identificador inválido.');
    }

    return numero;
}

function dinero(valor) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(String(valor ?? ''))) {
        throw errorHttp(
            'Escribe un anticipo válido (máximo dos decimales).'
        );
    }

    const numero = Number(valor);

    if (!Number.isFinite(numero) || numero < 0) {
        throw errorHttp('Anticipo inválido.');
    }

    return numero;
}


// VALIDAR DATOS DE RESERVACIÓN
function validarFormulario(body, userId) {

    const texto = (valor, limite) =>
        typeof valor === 'string'
            ? valor.trim().slice(0, limite)
            : '';

    const cliente = texto(body.cliente, 120);
    const telefono = texto(body.telefono, 30);

    const direccion = texto(
        body.direccion_instalacion,
        300
    );

    const fecha = texto(body.fecha_evento, 10);
    const tipoLugar = texto(body.tipo_lugar, 30);

    if (!cliente || !telefono || !direccion) {
        throw errorHttp(
            'Nombre, teléfono y dirección de instalación son obligatorios.'
        );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        throw errorHttp(
            'Selecciona la fecha del evento.'
        );
    }

    const hoy = new Date().toLocaleDateString(
        'sv-SE',
        { timeZone: 'America/Mexico_City' }
    );

    if (fecha < hoy) {
        throw errorHttp(
            'No se pueden reservar fechas pasadas.'
        );
    }

    if (body.dia_anterior === '1' && fecha === hoy) {
        throw errorHttp(
            'No puedes programar una instalación para ayer.'
        );
    }

    const tiposPermitidos = [
        'DOMICILIO',
        'SALON_CERRADO',
        'ESPACIO_ABIERTO',
        'OTRO'
    ];

    if (!tiposPermitidos.includes(tipoLugar)) {
        throw errorHttp(
            'Selecciona el tipo de lugar.'
        );
    }

    const invitadosTexto = String(
        body.numero_invitados ?? ''
    ).trim();

    const invitados = invitadosTexto === ''
        ? null
        : Number(invitadosTexto);

    if (
        invitados !== null &&
        (
            !Number.isSafeInteger(invitados) ||
            invitados <= 0
        )
    ) {
        throw errorHttp(
            'El número de invitados debe ser positivo.'
        );
    }

    const anticipo = dinero(body.anticipo ?? '0');
    const metodo = texto(body.metodo_pago, 30);

    if (
        anticipo > 0 &&
        !['EFECTIVO','TARJETA','TRANSFERENCIA'].includes(metodo)
    ) {
        throw errorHttp(
            'Selecciona el método de pago para el anticipo.'
        );
    }

    const email = texto(body.email, 150);

    if (
        email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        throw errorHttp(
            'Correo electrónico inválido.'
        );
    }

    return {
        usuario_id: userId,

        inflable_id: enteroPositivo(
            body.inflable_id
        ),

        cliente,
        telefono,
        email,

        nombre_evento: texto(
            body.nombre_evento,
            150
        ),

        tipo_evento: texto(body.tipo_evento, 80),
        numero_invitados: invitados,

        evento_con_menores:
            body.evento_con_menores === '1',

        fecha_evento: fecha,
        dia_anterior: body.dia_anterior === '1',

        direccion,

        referencias: texto(
            body.referencias_ubicacion,
            1000
        ),

        tipo_lugar: tipoLugar,

        observaciones: texto(
            body.observaciones,
            2000
        ),

        anticipo,
        metodo_pago: metodo,

        referencia_pago: texto(
            body.referencia_pago,
            120
        )
    };
}


// SUBIR CONTRATO FIRMADO A CLOUDINARY
function subirPDF(buffer, reservacionId) {
    return new Promise((resolve, reject) => {

        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'contratosHelpingBee',

                public_id:
                    `firma-${reservacionId}-${randomUUID()}.pdf`,

                resource_type: 'raw',
                type: 'authenticated'
            },

            (error, resultado) => {
                if (error) return reject(error);
                resolve(resultado);
            }
        );

        stream.end(buffer);
    });
}


class RentaInflablesController {

    // MOSTRAR PANTALLA PRINCIPAL
    static async inicio(req, res) {
        try {
            const inflables =
                await RentaInflablesModel.catalogo();

            const aviso =
                req.query.ok === 'reserva'
                    ? 'Reservación registrada correctamente.'
                    : req.query.ok === 'contrato'
                        ? 'Contrato firmado guardado correctamente.'
                        : null;

            return res.render('vistaCajeroInflable', {
                user: req.user,
                inflables,
                aviso
            });

        } catch (error) {
            console.error(
                'Error al abrir caja inflables:',
                error
            );

            return res.status(500).send(
                'No se pudo cargar la caja de inflables.'
            );
        }
    }


    // CONSULTAR EVENTOS DEL CALENDARIO
    static async eventos(req, res) {
        try {
            const filas =
                await RentaInflablesModel.reservasDelMes(
                    req.query.mes
                );

            return res.json(filas);

        } catch (error) {
            console.error(
                'Error al consultar calendario:',
                error
            );

            return res.status(error.status || 500).json({
                error: error.message
            });
        }
    }


    // COMPROBAR FECHA DISPONIBLE
    static async disponibilidad(req, res) {
        try {
            const resultado =
                await RentaInflablesModel.disponibilidad(
                    enteroPositivo(req.query.inflable_id),
                    req.query.fecha_evento,
                    req.query.dia_anterior === '1'
                );

            return res.json(resultado);

        } catch (error) {
            console.error(
                'Error al consultar disponibilidad:',
                error
            );

            return res.status(error.status || 500).json({
                error: error.message
            });
        }
    }


    // CREAR RESERVACIÓN
    static async reservar(req, res) {
        try {
            const userId = enteroPositivo(
                req.user?.id ?? req.user?.id_usuario
            );

            const datos = validarFormulario(
                req.body || {},
                userId
            );

            const id =
                await RentaInflablesModel.reservar(datos);

            console.log(
                'Reservación de inflable creada:',
                id
            );

            return res.redirect(
                '/admin/inflables/caja?ok=reserva'
            );

        } catch (error) {
            console.error(
                'Error al reservar inflable:',
                error
            );

            return res.status(error.status || 500).send(
                error.status
                    ? error.message
                    : 'No se pudo registrar la reservación.'
            );
        }
    }


    // SUBIR PDF DEL CONTRATO FIRMADO
    static async subirContrato(req, res) {
        let subida = null;

        try {
            const id = enteroPositivo(req.params.id);

            const usuarioId = enteroPositivo(
                req.user?.id ?? req.user?.id_usuario
            );

            if (!req.file) {
                throw errorHttp(
                    'Selecciona un PDF firmado.'
                );
            }

            // Comprobar la firma básica del archivo PDF
            const firma = req.file.buffer
                .subarray(0, 5)
                .toString('ascii');

            if (firma !== '%PDF-') {
                throw errorHttp(
                    'El archivo no parece ser un PDF válido.'
                );
            }

            const registro =
                await RentaInflablesModel.datosContrato(id);

            if (!registro) {
                throw errorHttp(
                    'Reservación inexistente.',
                    404
                );
            }

            if (registro.archivo_pdf_url) {
                throw errorHttp(
                    'Ya tiene un contrato firmado.',
                    409
                );
            }

            // Subir el PDF autenticado
            subida = await subirPDF(
                req.file.buffer,
                id
            );

            // Guardar su URL en MySQL
            await RentaInflablesModel.guardarContratoFirmado(
                id,
                usuarioId,
                subida.secure_url
            );

            return res.redirect(
                '/admin/inflables/caja?ok=contrato'
            );

        } catch (error) {

            // Si falla MySQL, eliminar la subida nueva
            if (subida?.public_id) {
                try {
                    await cloudinary.uploader.destroy(
                        subida.public_id,
                        {
                            resource_type: 'raw',
                            type: 'authenticated'
                        }
                    );

                } catch (errorNube) {
                    console.error(
                        'No se pudo revertir PDF en Cloudinary:',
                        errorNube
                    );
                }
            }

            console.error(
                'Error al subir contrato:',
                error
            );

            return res.status(error.status || 500).send(
                error.status
                    ? error.message
                    : 'No se pudo guardar el contrato firmado.'
            );
        }
    }
}

module.exports = RentaInflablesController;
