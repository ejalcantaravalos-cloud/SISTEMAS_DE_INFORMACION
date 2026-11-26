const SalonModel = require('../models/SalonesModel');

const cloudinary = require('../Database/Cloudinary');

const { randomUUID } = require('crypto');

const CARPETA = 'imagenesHelpingBee/salones';

function subirImagen(buffer) {

    return new Promise((resolve, reject) => {

        const stream = cloudinary.uploader.upload_stream(

            {

                public_id: `${CARPETA}/${randomUUID()}`,

                resource_type: 'image',

                overwrite: false

            },

            (error, resultado) => {

                if (error) return reject(error);

                resolve(resultado);

            }

        );

        stream.end(buffer);

    });

}

// Eliminar una imagen de Cloudinary mediante su public_id.
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

// Obtener el public_id de las imágenes creadas
// por este controlador.
function obtenerPublicId(url) {

    if (!url) return null;

    try {

        const direccion = new URL(url);

        if (

            direccion.protocol !== 'https:' ||

            direccion.hostname !== 'res.cloudinary.com'

        ) {

            return null;

        }

        const coincidencia = direccion.pathname.match(

            /\/image\/upload\/v\d+\/(imagenesHelpingBee\/salones\/[a-f0-9-]{36})\.[a-z0-9]+$/i

        );

        return coincidencia ? coincidencia[1] : null;

    } catch {

        return null;

    }

}

//manejo de errores
function errorHttp(codigo, mensaje) {

    const error = new Error(mensaje);

    error.status = codigo;

    return error;

}

function responderError(res, error, mensaje) {

    console.error(mensaje, error);

    // Nombre duplicado.
    if (error.code === 'ER_DUP_ENTRY') {

        return res.status(409).send(

            'Ya existe un salón con ese nombre.'

        );

    }

    // Intento de eliminar la última fotografía.
    if (

        error.message ===

        'El salón debe conservar al menos una fotografía.'

    ) {

        return res.status(409).send(error.message);

    }

    // Errores controlados.
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

function validarTexto(

    valor,

    campo,

    obligatorio = false,

    maximo = 255

) {

    const texto = typeof valor === 'string'

        ? valor.trim()

        : '';

    if (obligatorio && !texto) {

        throw errorHttp(

            400,

            `El campo ${campo} es obligatorio.`

        );

    }

    if (texto.length > maximo) {

        throw errorHttp(

            400,

            `${campo} no puede superar ${maximo} caracteres.`

        );

    }

    return texto || null;

}

function validarNumero(valor, campo, opciones = {}) {

    const {

        obligatorio = true,

        minimo = 0,

        maximo = 9999999999.99,

        entero = false

    } = opciones;

    if (

        valor == null ||

        String(valor).trim() === ''

    ) {

        if (obligatorio) {

            throw errorHttp(

                400,

                `El campo ${campo} es obligatorio.`

            );

        }

        return null;

    }

    const texto = String(valor).trim();

    const formato = entero

        ? /^\d+$/

        : /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/;

    const numero = Number(texto);

    if (

        !formato.test(texto) ||

        !Number.isFinite(numero) ||

        numero < minimo ||

        numero > maximo ||

        (entero && !Number.isSafeInteger(numero))

    ) {

        throw errorHttp(

            400,

            `El campo ${campo} contiene un valor inválido.`

        );

    }

    return numero;

}

function prepararDatos(body = {}) {

    const nombre = validarTexto(

        body.nombre,

        'nombre del salón',

        true,

        120

    );

    const descripcion = validarTexto(

        body.descripcion,

        'descripción',

        true,

        65535

    );

    if (Buffer.byteLength(descripcion, 'utf8') > 65535) {

        throw errorHttp(400, 'La descripción es demasiado larga.');

    }

    const ubicacion = validarTexto(

        body.ubicacion,

        'ubicación'

    );

    const capacidad = validarNumero(

        body.capacidad,

        'capacidad',

        {

            minimo: 1,

            maximo: 2147483647,

            entero: true

        }

    );

    // Validar dimensiones.
    const largo_m = validarNumero(

        body.largo_m,

        'largo',

        {

            minimo: 0.01,

            maximo: 99999.99

        }

    );

    const ancho_m = validarNumero(

        body.ancho_m,

        'ancho',

        {

            minimo: 0.01,

            maximo: 99999.99

        }

    );

    const alto_m = validarNumero(

        body.alto_m,

        'altura',

        {

            minimo: 0.01,

            maximo: 99999.99

        }

    );

    // Validar tipo de salón.
    const tiposPermitidos = [

        'Abierto',

        'Techado',

        'Mixto'

    ];

    const tipo_salon = body.tipo_salon;

    if (!tiposPermitidos.includes(tipo_salon)) {

        throw errorHttp(

            400,

            'Debes seleccionar un tipo de salón válido.'

        );

    }

    // Validar precio de renta.
    // El nombre oficial del campo de salones sigue siendo tarifa_base.
    // Compatibilidad temporal con formularios que enviaban precio_completo.
    const tieneTarifa = body.tarifa_base != null &&
        String(body.tarifa_base).trim() !== '';
    const tienePrecioCompleto = body.precio_completo != null &&
        String(body.precio_completo).trim() !== '';

    const tarifa_base = validarNumero(
        tieneTarifa ? body.tarifa_base : body.precio_completo,
        'precio de renta'
    );

    if (tieneTarifa && tienePrecioCompleto) {
        const precioAlternativo = validarNumero(
            body.precio_completo,
            'precio de renta alternativo'
        );

        if (tarifa_base !== precioAlternativo) {
            throw errorHttp(400, 'El formulario envió dos precios de renta diferentes.');
        }
    }

    // Validar horas incluidas.
    const horas_incluidas = validarNumero(

        body.horas_incluidas,

        'horas incluidas',

        {

            minimo: 1,

            maximo: 2147483647,

            entero: true

        }

    );

    // La tarifa por hora extra es opcional.
    const tarifa_hora_extra = validarNumero(

        body.tarifa_hora_extra,

        'precio por hora adicional',

        {

            obligatorio: false

        }

    );

    // Validar cuota de limpieza.
    const deposito_limpieza = validarNumero(

        body.deposito_limpieza,

        'cuota de limpieza'

    );

    return {

        nombre,

        capacidad,

        largo_m,

        ancho_m,

        alto_m,

        tipo_salon,

        descripcion,

        ubicacion,

        tarifa_base,

        horas_incluidas,

        tarifa_hora_extra,

        deposito_limpieza

    };

}

function validarImagen(archivo) {

    if (!archivo || !Buffer.isBuffer(archivo.buffer)) {

        throw errorHttp(

            400,

            'Debes seleccionar una fotografía.'

        );

    }

    const formatosPermitidos = [

        'image/jpeg',

        'image/png',

        'image/webp'

    ];

    if (!formatosPermitidos.includes(archivo.mimetype)) {

        throw errorHttp(

            400,

            'Solo se permiten imágenes JPG, PNG o WEBP.'

        );

    }

    if (archivo.buffer.length === 0) {

        throw errorHttp(400, 'La fotografía está vacía.');

    }

    // Tamaño máximo: 5 MB por fotografía.
    if (archivo.buffer.length > 5 * 1024 * 1024) {

        throw errorHttp(

            400,

            'Cada fotografía debe pesar máximo 5 MB.'

        );

    }

}

class SalonController {

    static async listar(req, res) {

        try {

            let salones = await SalonModel.obtenerTodos();

            const busqueda = typeof req.query.buscar === 'string'

                ? req.query.buscar.trim()

                : '';

            if (busqueda) {

                salones = salones.filter(salon =>

                    salon.nombre.toLowerCase().includes(

                        busqueda.toLowerCase()

                    )

                );

            }

            const mensajes = {

                creado: 'Salón registrado correctamente.',

                actualizado: 'Salón actualizado correctamente.',

                estado_actualizado:

                    'Estado actualizado correctamente.',

                imagen_agregada:

                    'Fotografía agregada correctamente.',

                imagen_eliminada:

                    'Fotografía eliminada correctamente.',

                imagen_reemplazada:

                    'Fotografía reemplazada correctamente.',

                portada_actualizada:

                    'Portada actualizada correctamente.'

            };

            const aviso = Object.prototype.hasOwnProperty.call(

                mensajes,

                req.query.aviso

            )

                ? mensajes[req.query.aviso]

                : null;

            return res.render('AdminSalones', {

                user: req.user,

                salones,

                aviso,

                busqueda

            });

        } catch (error) {

            console.error(

                'Error al listar salones:',

                error

            );

            return res.status(500).render('AdminSalones', {

                user: req.user,

                salones: [],

                aviso: 'No se pudieron cargar los salones.',

                busqueda: ''

            });

        }

    }

    static async obtenerPorId(req, res) {

        try {

            const id = validarId(req.params.id);

            const salon = await SalonModel.obtenerPorId(id);

            if (!salon) {

                throw errorHttp(

                    404,

                    'No se encontró el salón.'

                );

            }

            const imagenes = await SalonModel.obtenerImagenes(id);

            return res.json({

                salon,

                imagenes

            });

        } catch (error) {

            return responderError(

                res,

                error,

                'No se pudo consultar el salón.'

            );

        }

    }

    static async crear(req, res) {

        const subidas = [];

        try {

            const datos = prepararDatos(req.body);

            // Permitir múltiples fotografías.
            const archivos = Array.isArray(req.files)

                ? req.files

                : req.file

                    ? [req.file]

                    : [];

            if (archivos.length === 0) {

                throw errorHttp(

                    400,

                    'Debes agregar al menos una fotografía.'

                );

            }

            if (archivos.length > 8) {

                throw errorHttp(

                    400,

                    'Puedes subir máximo 8 fotografías a la vez.'

                );

            }

            // Validar todas las imágenes antes de subirlas.
            archivos.forEach(validarImagen);

            const descripcionImagen = validarTexto(

                req.body.descripcion_imagen,

                'descripción de la fotografía'

            );

            // Subir fotografías a Cloudinary.
            for (const archivo of archivos) {

                const subida = await subirImagen(

                    archivo.buffer

                );

                subidas.push(subida);

            }

            // Preparar las imágenes para el modelo.
            const imagenes = subidas.map(imagen => ({

                url: imagen.secure_url,

                descripcion: descripcionImagen

            }));

            // Registrar salón y fotografías en MySQL.
            await SalonModel.crear(datos, imagenes);

        } catch (error) {

            // Si falló el registro, eliminar las imágenes
            // que ya se habían subido a Cloudinary.
            for (const imagen of subidas) {

                await eliminarDeCloudinary(

                    imagen.public_id

                );

            }

            return responderError(

                res,

                error,

                'No se pudo registrar el salón.'

            );

        }

        return res.redirect(

            '/admin/salones?aviso=creado'

        );

    }

    static async actualizar(req, res) {

        try {

            const id = validarId(req.params.id);

            const datos = prepararDatos(req.body);

            const actualizado = await SalonModel.actualizar(

                id,

                datos

            );

            if (!actualizado) {

                throw errorHttp(

                    404,

                    'No se encontró el salón.'

                );

            }

            return res.redirect(

                '/admin/salones?aviso=actualizado'

            );

        } catch (error) {

            return responderError(

                res,

                error,

                'No se pudo actualizar el salón.'

            );

        }

    }

    static async cambiarActivo(req, res) {

        try {

            const id = validarId(req.params.id);

            const activo = String(req.body?.activo);

            if (!['0', '1'].includes(activo)) {

                throw errorHttp(

                    400,

                    'El estado proporcionado no es válido.'

                );

            }

            const actualizado = await SalonModel.cambiarActivo(

                id,

                activo === '1'

            );

            if (!actualizado) {

                throw errorHttp(

                    404,

                    'No se encontró el salón.'

                );

            }

            return res.redirect(

                '/admin/salones?aviso=estado_actualizado'

            );

        } catch (error) {

            return responderError(

                res,

                error,

                'No se pudo cambiar el estado del salón.'

            );

        }

    }

    static async agregarImagen(req, res) {

        let subida = null;

        try {

            const id = validarId(req.params.id);

            const salon = await SalonModel.obtenerPorId(id);

            if (!salon) {

                throw errorHttp(

                    404,

                    'No se encontró el salón.'

                );

            }

            validarImagen(req.file);

            const descripcion = validarTexto(

                req.body.descripcion_imagen,

                'descripción de la fotografía'

            );

            subida = await subirImagen(

                req.file.buffer

            );

            const registrada = await SalonModel.agregarImagen(

                id,

                subida.secure_url,

                descripcion

            );

            if (!registrada) {

                throw errorHttp(

                    404,

                    'No se encontró el salón.'

                );

            }

        } catch (error) {

            if (subida?.public_id) {

                await eliminarDeCloudinary(

                    subida.public_id

                );

            }

            return responderError(

                res,

                error,

                'No se pudo agregar la fotografía.'

            );

        }

        return res.redirect(

            '/admin/salones?aviso=imagen_agregada'

        );

    }

    static async establecerPortada(req, res) {

        try {

            const id = validarId(req.params.id);

            const imagenId = validarId(

                req.params.imagenId

            );

            const actualizado =

                await SalonModel.establecerPortada(

                    id,

                    imagenId

                );

            if (!actualizado) {

                throw errorHttp(

                    404,

                    'No se encontró la fotografía del salón.'

                );

            }

            return res.redirect(

                '/admin/salones?aviso=portada_actualizada'

            );

        } catch (error) {

            return responderError(

                res,

                error,

                'No se pudo establecer la portada.'

            );

        }

    }

    static async reemplazarImagen(req, res) {

        let subida = null;

        let imagenAnterior = null;

        try {

            const id = validarId(req.params.id);

            const imagenId = validarId(

                req.params.imagenId

            );

            validarImagen(req.file);

            const descripcion = validarTexto(

                req.body.descripcion_imagen,

                'descripción de la fotografía'

            );

            subida = await subirImagen(

                req.file.buffer

            );

            imagenAnterior =

                await SalonModel.reemplazarImagen(

                    id,

                    imagenId,

                    subida.secure_url,

                    descripcion

                );

            if (!imagenAnterior) {

                throw errorHttp(

                    404,

                    'No se encontró la fotografía del salón.'

                );

            }

        } catch (error) {

            // Eliminar la nueva fotografía si falló
            // la actualización en MySQL.
            if (subida?.public_id) {

                await eliminarDeCloudinary(

                    subida.public_id

                );

            }

            return responderError(

                res,

                error,

                'No se pudo reemplazar la fotografía.'

            );

        }

        // Eliminar la fotografía anterior solamente
        // después de actualizar correctamente MySQL.
        const publicIdAnterior = obtenerPublicId(

            imagenAnterior.url

        );

        await eliminarDeCloudinary(publicIdAnterior);

        return res.redirect(

            '/admin/salones?aviso=imagen_reemplazada'

        );

    }

    static async eliminarImagen(req, res) {

        try {

            const id = validarId(req.params.id);

            const imagenId = validarId(

                req.params.imagenId

            );

            const eliminada = await SalonModel.eliminarImagen(

                id,

                imagenId

            );

            if (!eliminada) {

                throw errorHttp(

                    404,

                    'No se encontró la fotografía del salón.'

                );

            }

            // Eliminar el archivo de Cloudinary.
            const publicId = obtenerPublicId(

                eliminada.url

            );

            await eliminarDeCloudinary(publicId);

            return res.redirect(

                '/admin/salones?aviso=imagen_eliminada'

            );

        } catch (error) {

            return responderError(

                res,

                error,

                'No se pudo eliminar la fotografía.'

            );

        }

    }

// Listar para el publico
// MOSTRAR CATÁLOGO PÚBLICO DE SALONES
static async obtenerCatalogoPublico(req, res) {

    try {

        const todos = await SalonModel.obtenerTodos();

        // Mostrar únicamente los salones habilitados.
        const activos = todos.filter(

            salon => Number(salon.activo) === 1

        );

        // Obtener todas las fotografías de cada salón.
        const salones = await Promise.all(

            activos.map(async salon => {

                const imagenes =

                    await SalonModel.obtenerImagenes(salon.id);

                return {

                    ...salon,

                    imagenes

                };

            })

        );

        return res.render('SalonesPublico', {

            user: req.user,

            salones

        });

    } catch (error) {

        console.error(

            'Error al cargar catálogo de salones:',

            error

        );

        return res.status(500).render('SalonesPublico', {

            user: req.user,

            salones: []

        });

    }

}

}

module.exports = SalonController;