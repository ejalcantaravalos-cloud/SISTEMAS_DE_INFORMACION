const SonidoModel = require('../models/SonidoModel');
const cloudinary = require('../Database/Cloudinary');
const { randomUUID } = require('crypto');

const CARPETA = 'imagenesHelpingBee/sonido';


function subirImagen(buffer) {

    return new Promise((resolve, reject) => {

        const stream = cloudinary.uploader.upload_stream(
            {
                public_id: `${CARPETA}/${randomUUID()}`,
                resource_type: 'image',
                overwrite: false,
                allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
            },
            (error, resultado) => {

                if (error) return reject(error);

                resolve(resultado);
            }
        );

        stream.end(buffer);
    });
}


async function eliminarDeCloudinary(publicId) {

    if (!publicId) return;

    try {

        await cloudinary.uploader.destroy(publicId, {
            resource_type: 'image',
            invalidate: true
        });

    } catch (error) {

        console.error(
            'Error al eliminar imagen de Cloudinary:',
            error
        );
    }
}

function errorHttp(codigo, mensaje) {

    const error = new Error(mensaje);

    error.status = codigo;

    return error;
}


function responderError(res, error, mensaje) {

    console.error(mensaje, error);

    if ([400, 404, 409].includes(error.status)) {

        return res.status(error.status).send(error.message);
    }

    return res.status(500).send(mensaje);
}


function validarId(valor) {

    const id = Number(valor);

    if (!Number.isSafeInteger(id) || id <= 0) {

        throw errorHttp(400, 'ID inválido.');
    }

    return id;
}

function prepararDatos(body = {}) {

    const nombre = typeof body.nombre === 'string'
        ? body.nombre.trim()
        : '';

    const descripcion = typeof body.descripcion === 'string'
        ? body.descripcion.trim()
        : '';

    const precioTexto = String(
        body.precio_renta ?? ''
    ).trim();

    const stockTexto = String(
        body.stock_total ?? ''
    ).trim();

    const precio = Number(precioTexto);

    const stock = Number(stockTexto);


    // VALIDAR NOMBRE

    if (!nombre || nombre.length > 120) {

        throw errorHttp(
            400,
            'El nombre es obligatorio y debe tener máximo 120 caracteres.'
        );
    }


    // VALIDAR DESCRIPCIÓN

    if (Buffer.byteLength(descripcion, 'utf8') > 65535) {

        throw errorHttp(
            400,
            'La descripción es demasiado larga.'
        );
    }


    // VALIDAR PRECIO

    if (
        !/^\d+(\.\d{1,2})?$/.test(precioTexto) ||
        !Number.isFinite(precio) ||
        precio < 0 ||
        precio > 9999999999.99
    ) {

        throw errorHttp(
            400,
            'El precio de renta no es válido.'
        );
    }


    // VALIDAR EXISTENCIAS

    if (
        !/^\d+$/.test(stockTexto) ||
        !Number.isSafeInteger(stock) ||
        stock < 0 ||
        stock > 2147483647
    ) {

        throw errorHttp(
            400,
            'Las existencias deben ser un número entero mayor o igual a cero.'
        );
    }


    return {
        nombre,
        descripcion: descripcion || null,
        precio_renta: precio,
        stock_total: stock
    };
}


function validarImagen(archivo) {

    const formatos = [
        'image/jpeg',
        'image/png',
        'image/webp'
    ];

    if (
        !archivo ||
        !Buffer.isBuffer(archivo.buffer) ||
        !formatos.includes(archivo.mimetype) ||
        archivo.buffer.length === 0 ||
        archivo.buffer.length > 5 * 1024 * 1024
    ) {

        throw errorHttp(
            400,
            'Selecciona una imagen JPG, PNG o WEBP de máximo 5 MB.'
        );
    }
}



class SonidoController {


    // LISTAR EQUIPOS

    static async listar(req, res) {

        try {

            let equipos = await SonidoModel.obtenerTodos();

            const busqueda =
                typeof req.query.buscar === 'string'
                    ? req.query.buscar.trim()
                    : '';

            if (busqueda) {

                equipos = equipos.filter(equipo =>
                    equipo.nombre.toLowerCase().includes(
                        busqueda.toLowerCase()
                    )
                );
            }

            const mensajes = {
                creado: 'Equipo registrado correctamente.',
                actualizado: 'Equipo actualizado correctamente.',
                estado_actualizado: 'Estado actualizado correctamente.',
                imagen_eliminada: 'Fotografía eliminada correctamente.'
            };

            const aviso = Object.prototype.hasOwnProperty.call(
                mensajes,
                req.query.aviso
            )
                ? mensajes[req.query.aviso]
                : null;

            return res.render('AdminSonido', {
                user: req.user,
                equipos,
                aviso,
                busqueda
            });

        } catch (error) {

            console.error(
                'Error al listar equipos de sonido:',
                error
            );

            return res.status(500).render('AdminSonido', {
                user: req.user,
                equipos: [],
                aviso: 'No se pudieron cargar los equipos.',
                busqueda: ''
            });
        }
    }


    // OBTENER EQUIPO POR ID

    static async obtenerPorId(req, res) {

        try {

            const id = validarId(req.params.id);

            const equipo = await SonidoModel.obtenerPorId(id);

            if (!equipo) {

                throw errorHttp(
                    404,
                    'No se encontró el equipo.'
                );
            }

            return res.json({ equipo });

        } catch (error) {

            return responderError(
                res,
                error,
                'No se pudo consultar el equipo.'
            );
        }
    }


    // REGISTRAR EQUIPO

    static async crear(req, res) {

        let subida = null;

        try {

            const datos = prepararDatos(req.body);

            datos.imagen_url = null;
            datos.imagen_public_id = null;

            if (req.file) {

                validarImagen(req.file);

                subida = await subirImagen(
                    req.file.buffer
                );

                datos.imagen_url = subida.secure_url;

                datos.imagen_public_id = subida.public_id;
            }

            await SonidoModel.crear(datos);

        } catch (error) {

            if (subida) {

                await eliminarDeCloudinary(
                    subida.public_id
                );
            }

            return responderError(
                res,
                error,
                'No se pudo registrar el equipo.'
            );
        }

        return res.redirect(
            '/admin/sonido?aviso=creado'
        );
    }


    // ACTUALIZAR EQUIPO

    static async actualizar(req, res) {

        let subida = null;
        let equipo = null;

        try {

            const id = validarId(req.params.id);

            const datos = prepararDatos(req.body);

            equipo = await SonidoModel.obtenerPorId(id);

            if (!equipo) {

                throw errorHttp(
                    404,
                    'No se encontró el equipo.'
                );
            }

            // Si seleccionamos una nueva imagen,
            // se reemplaza la anterior.

            if (req.file) {

                validarImagen(req.file);

                subida = await subirImagen(
                    req.file.buffer
                );

                datos.imagen_url = subida.secure_url;

                datos.imagen_public_id = subida.public_id;
            }

            const actualizado = await SonidoModel.actualizar(
                id,
                datos,
                equipo.imagen_public_id
            );

            if (!actualizado) {

                throw errorHttp(
                    409,
                    'No se pudo actualizar el equipo. Recarga la página e inténtalo nuevamente.'
                );
            }

        } catch (error) {

            if (subida) {

                await eliminarDeCloudinary(
                    subida.public_id
                );
            }

            return responderError(
                res,
                error,
                'No se pudo actualizar el equipo.'
            );
        }

        // Eliminar la fotografía anterior solamente
        // después de actualizar correctamente MySQL.

        if (subida && equipo.imagen_public_id) {

            await eliminarDeCloudinary(
                equipo.imagen_public_id
            );
        }

        return res.redirect(
            '/admin/sonido?aviso=actualizado'
        );
    }


    // ACTIVAR O DESACTIVAR EQUIPO

    static async cambiarActivo(req, res) {

        try {

            const id = validarId(req.params.id);

            const activo = String(req.body?.activo);

            if (!['0', '1'].includes(activo)) {

                throw errorHttp(
                    400,
                    'Estado no válido.'
                );
            }

            const actualizado =
                await SonidoModel.cambiarActivo(
                    id,
                    activo === '1'
                );

            if (!actualizado) {

                throw errorHttp(
                    404,
                    'No se encontró el equipo.'
                );
            }

            return res.redirect(
                '/admin/sonido?aviso=estado_actualizado'
            );

        } catch (error) {

            return responderError(
                res,
                error,
                'No se pudo cambiar el estado.'
            );
        }
    }


    // ELIMINAR FOTOGRAFÍA

    static async eliminarImagen(req, res) {

        try {

            const id = validarId(req.params.id);

            const equipo = await SonidoModel.obtenerPorId(id);

            if (!equipo) {

                throw errorHttp(
                    404,
                    'No se encontró el equipo.'
                );
            }

            const eliminada = await SonidoModel.eliminarImagen(
                id,
                equipo.imagen_public_id
            );

            if (!eliminada) {

                throw errorHttp(
                    409,
                    'La fotografía fue modificada. Recarga la página.'
                );
            }

            await eliminarDeCloudinary(
                equipo.imagen_public_id
            );

            return res.redirect(
                '/admin/sonido?aviso=imagen_eliminada'
            );

        } catch (error) {

            return responderError(
                res,
                error,
                'No se pudo eliminar la fotografía.'
            );
        }
    }

}

module.exports = SonidoController;