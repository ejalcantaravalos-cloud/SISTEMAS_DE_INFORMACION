const MantelesModel = require('../models/MantelesModel');
const cloudinary = require('../Database/Cloudinary');
const { randomUUID } = require('crypto');
const Avisos = require('../utils/Avisos');

const CARPETA = 'imagenesHelpingBee/manteles';
const RUTA = '/admin/manteles';


// ========================================
// MANEJO DE ERRORES
// ========================================

function errorHttp(status, mensaje) {

    const error = new Error(mensaje);
    error.status = status;

    return error;
}


// Errores para consultas individuales

function responderError(res, error, mensaje) {

    console.error(mensaje, error);

    if ([400, 404, 409].includes(error.status)) {

        return res.status(error.status).send(error.message);
    }

    return res.status(500).send(mensaje);
}


// ========================================
// VALIDAR ID
// ========================================

function validarId(valor) {

    const id = Number(valor);

    if (!Number.isSafeInteger(id) || id <= 0) {

        throw errorHttp(400, 'ID inválido.');
    }

    return id;
}


// ========================================
// VALIDAR DATOS
// ========================================

function prepararDatos(body = {}) {

    const texto = valor =>
        typeof valor === 'string' ? valor.trim() : '';

    const nombre = texto(body.nombre);
    const descripcion = texto(body.descripcion);
    const color = texto(body.color);
    const codigo_color = texto(body.codigo_color);
    const forma = texto(body.forma);
    const medidas = texto(body.medidas);

    const precioTexto = texto(body.precio_renta);
    const stockTexto = texto(body.stock_total);

    const precio_renta = Number(precioTexto);
    const stock_total = Number(stockTexto);


    // NOMBRE

    if (!nombre || nombre.length > 120) {

        throw errorHttp(400, 'Nombre del mantel inválido.');
    }


    // DESCRIPCIÓN

    if (Buffer.byteLength(descripcion, 'utf8') > 65535) {

        throw errorHttp(400, 'Descripción demasiado larga.');
    }


    // COLOR

    if (!color || color.length > 50) {

        throw errorHttp(400, 'Nombre del color inválido.');
    }


    // CÓDIGO HEXADECIMAL

    if (!/^#[0-9a-fA-F]{6}$/.test(codigo_color)) {

        throw errorHttp(400, 'Código de color inválido.');
    }


    // FORMA

    const formasPermitidas = [
        'Redondo',
        'Rectangular',
        'Cuadrado'
    ];

    if (!formasPermitidas.includes(forma)) {

        throw errorHttp(400, 'Forma del mantel inválida.');
    }


    // MEDIDAS

    if (!medidas || medidas.length > 100) {

        throw errorHttp(400, 'Las medidas son obligatorias.');
    }


    // PRECIO

    if (
        !/^\d+(\.\d{1,2})?$/.test(precioTexto) ||
        !Number.isFinite(precio_renta) ||
        precio_renta < 0 ||
        precio_renta > 9999999999.99
    ) {

        throw errorHttp(400, 'Precio de renta inválido.');
    }


    // EXISTENCIAS

    if (
        !/^\d+$/.test(stockTexto) ||
        !Number.isSafeInteger(stock_total) ||
        stock_total < 0 ||
        stock_total > 2147483647
    ) {

        throw errorHttp(400, 'Existencias inválidas.');
    }


    return {
        nombre,
        descripcion: descripcion || null,
        color,
        codigo_color,
        forma,
        medidas,
        precio_renta,
        stock_total
    };
}


// ========================================
// SUBIR IMAGEN A CLOUDINARY
// ========================================

function subirImagen(archivo) {

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

        stream.end(archivo.buffer);
    });
}


// ========================================
// ELIMINAR IMAGEN DE CLOUDINARY
// ========================================

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


// ========================================
// CONTROLADOR DE MANTELES
// ========================================

class MantelesController {


    // ====================================
    // LISTAR MANTELES
    // ====================================

    static async listar(req, res) {

        try {

            let manteles = await MantelesModel.obtenerTodos();

            const busqueda =
                typeof req.query.buscar === 'string'
                    ? req.query.buscar.trim()
                    : '';

            if (busqueda) {

                const termino = busqueda.toLowerCase();

                manteles = manteles.filter(mantel =>

                    mantel.nombre.toLowerCase().includes(termino) ||

                    mantel.color.toLowerCase().includes(termino) ||

                    mantel.forma.toLowerCase().includes(termino)
                );
            }


            return res.render('AdminManteles', {

                user: req.user,
                manteles,
                busqueda,

                // AVISOS REUTILIZABLES

                ...Avisos.obtener(req, {

                    creado: 'Mantel registrado correctamente.',

                    actualizado: 'Mantel actualizado correctamente.'

                })

            });

        } catch (error) {

            console.error('Error al listar manteles:', error);

            return res.status(500).render('AdminManteles', {

                user: req.user,
                manteles: [],
                busqueda: '',

                aviso: 'No se pudieron cargar los manteles.',
                tipoAviso: 'error'

            });
        }
    }


    // ====================================
    // OBTENER MANTEL POR ID
    // ====================================

    static async obtenerPorId(req, res) {

        try {

            const id = validarId(req.params.id);

            const mantel = await MantelesModel.obtenerPorId(id);

            if (!mantel) {

                throw errorHttp(404, 'Mantel no encontrado.');
            }

            return res.json({ mantel });

        } catch (error) {

            return responderError(
                res,
                error,
                'No se pudo consultar el mantel.'
            );
        }
    }


    // ====================================
    // REGISTRAR MANTEL
    // ====================================

    static async crear(req, res) {

        let subida = null;

        try {

            const datos = prepararDatos(req.body);

            datos.imagen_url = null;
            datos.imagen_public_id = null;

            if (req.file) {

                subida = await subirImagen(req.file);

                datos.imagen_url = subida.secure_url;
                datos.imagen_public_id = subida.public_id;
            }

            await MantelesModel.crear(datos);

        } catch (error) {

            if (subida) {

                await eliminarDeCloudinary(subida.public_id);
            }

            return Avisos.error(res, error, RUTA);
        }

        return Avisos.exito(res, RUTA, 'creado');
    }


    // ====================================
    // ACTUALIZAR MANTEL
    // ====================================

    static async actualizar(req, res) {

        let subida = null;
        let mantel = null;

        try {

            const id = validarId(req.params.id);
            const datos = prepararDatos(req.body);

            mantel = await MantelesModel.obtenerPorId(id);

            if (!mantel) {

                throw errorHttp(404, 'Mantel no encontrado.');
            }

            if (req.file) {

                subida = await subirImagen(req.file);

                datos.imagen_url = subida.secure_url;
                datos.imagen_public_id = subida.public_id;
            }

            const actualizado = await MantelesModel.actualizar(
                id,
                datos,
                mantel.imagen_public_id
            );

            if (!actualizado) {

                throw errorHttp(
                    409,
                    'No se pudo actualizar. Recarga la página.'
                );
            }

        } catch (error) {

            if (subida) {

                await eliminarDeCloudinary(subida.public_id);
            }

            return Avisos.error(res, error, RUTA);
        }


        // ELIMINAR LA FOTO ANTERIOR

        if (subida && mantel.imagen_public_id) {

            await eliminarDeCloudinary(mantel.imagen_public_id);
        }

        return Avisos.exito(res, RUTA, 'actualizado');
    }


    // ====================================
    // ACTIVAR O DESACTIVAR
    // ====================================

    static async cambiarActivo(req, res) {

        try {

            const id = validarId(req.params.id);

            const activo = String(req.body?.activo);

            if (!['0', '1'].includes(activo)) {

                throw errorHttp(400, 'Estado inválido.');
            }

            const actualizado = await MantelesModel.cambiarActivo(
                id,
                activo === '1'
            );

            if (!actualizado) {

                throw errorHttp(404, 'Mantel no encontrado.');
            }

            return Avisos.exito(
                res,
                RUTA,
                'estado_actualizado'
            );

        } catch (error) {

            return Avisos.error(res, error, RUTA);
        }
    }


    // ====================================
    // ELIMINAR FOTOGRAFÍA
    // ====================================

    static async eliminarImagen(req, res) {

        try {

            const id = validarId(req.params.id);

            const mantel = await MantelesModel.obtenerPorId(id);

            if (!mantel) {

                throw errorHttp(404, 'Mantel no encontrado.');
            }

            const eliminada = await MantelesModel.eliminarImagen(
                id,
                mantel.imagen_public_id
            );

            if (!eliminada) {

                throw errorHttp(
                    409,
                    'La fotografía fue modificada. Recarga la página.'
                );
            }

            await eliminarDeCloudinary(mantel.imagen_public_id);

            return Avisos.exito(
                res,
                RUTA,
                'imagen_eliminada'
            );

        } catch (error) {

            return Avisos.error(res, error, RUTA);
        }
    }

}

module.exports = MantelesController;