const PaquetesModel = require('../models/PaquetesModel');
const cloudinary = require('../Database/Cloudinary');
const { randomUUID } = require('crypto');
const Avisos = require('../utils/Avisos');

const RUTA = '/rentas/paquetes';
const CARPETA = 'imagenesHelpingBee/paquetes';

// ========================================
// MENSAJES PERSONALIZADOS
// ========================================

const MENSAJES = {

    creado:
        'Paquete registrado correctamente.',

    actualizado:
        'Paquete actualizado correctamente.',

    error_nombre:
        'Escribe un nombre válido para el paquete.',

    error_descripcion:
        'La descripción es demasiado larga.',

    error_tipo:
        'Selecciona un tipo de paquete válido.',

    error_porciones:
        'El paquete preparado debe incluir al menos una porción de comida.',

    error_valor_porcion:
        'El valor cubierto por porción debe ser mayor a cero.',

    error_manteles:
        'El paquete preparado debe incluir al menos un mantel.',

    error_meseros:
        'La cantidad de meseros no es válida.',

    error_invitados:
        'Revisa las cantidades mínima y máxima de invitados.',

    error_capacidad:
        'Alguno de los salones seleccionados tiene capacidad insuficiente.',

    error_salones:
        'Selecciona al menos un salón activo.',

    error_sonido:
        'Revisa las cantidades y existencias del equipo de sonido.',

    error_precio:
        'El precio adicional del paquete no es válido.',

    error_extras:
        'Los paquetes sencillos y personalizados no deben tener extras predefinidos.',

    error_conflicto:
        'Ya existe un paquete con ese nombre o hubo un conflicto.'

};

// ========================================
// VALIDACIONES
// ========================================

function errorHttp(status, mensaje, codigoAviso) {

    const error = new Error(mensaje);

    error.status = status;
    error.codigoAviso = codigoAviso;

    return error;
}

function validarEntero(
    valor,
    minimo = 1,
    codigo = 'error_datos'
) {

    const texto = String(valor ?? '').trim();
    const numero = Number(texto);

    if (
        !/^\d+$/.test(texto) ||
        !Number.isSafeInteger(numero) ||
        numero < minimo ||
        numero > 2147483647
    ) {

        throw errorHttp(
            400,
            'Cantidad inválida.',
            codigo
        );
    }

    return numero;
}

function validarPrecio(
    valor,
    codigo = 'error_precio'
) {

    const texto = String(valor ?? '')
        .trim()
        .replace(',', '.');

    const numero = Number(texto);

    if (
        !/^\d+(\.\d{1,2})?$/.test(texto) ||
        !Number.isFinite(numero) ||
        numero < 0 ||
        numero > 9999999999.99
    ) {

        throw errorHttp(
            400,
            'Precio inválido.',
            codigo
        );
    }

    return numero;
}

// ========================================
// PREPARAR DATOS
// ========================================

function prepararDatos(body = {}) {

    const nombre = typeof body.nombre === 'string'
        ? body.nombre.trim()
        : '';

    const descripcion = typeof body.descripcion === 'string'
        ? body.descripcion.trim()
        : '';

    if (!nombre || nombre.length > 120) {

        throw errorHttp(
            400,
            'Nombre inválido.',
            'error_nombre'
        );
    }

    if (Buffer.byteLength(descripcion, 'utf8') > 65535) {

        throw errorHttp(
            400,
            'Descripción demasiado larga.',
            'error_descripcion'
        );
    }

    // INVITADOS

    const min_invitados = validarEntero(
        body.min_invitados,
        1,
        'error_invitados'
    );

    const max_invitados =
        String(body.max_invitados ?? '').trim() === ''
            ? null
            : validarEntero(
                body.max_invitados,
                1,
                'error_invitados'
            );

    if (
        max_invitados !== null &&
        max_invitados < min_invitados
    ) {

        throw errorHttp(
            400,
            'El máximo no puede ser menor que el mínimo.',
            'error_invitados'
        );
    }

    // SALONES

    const seleccionSalones = Array.isArray(body.salones)
        ? body.salones
        : body.salones
            ? [body.salones]
            : [];

    const salones = [
        ...new Set(
            seleccionSalones.map(id =>
                validarEntero(id, 1, 'error_salones')
            )
        )
    ];

    if (!salones.length) {

        throw errorHttp(
            400,
            'Selecciona al menos un salón.',
            'error_salones'
        );
    }

    // SONIDOS

    const sonidos = [];
    const seleccionSonidos = body.sonidos ?? {};

    if (
        typeof seleccionSonidos !== 'object' ||
        Array.isArray(seleccionSonidos)
    ) {

        throw errorHttp(
            400,
            'Selección de sonido inválida.',
            'error_sonido'
        );
    }

    for (const [clave, cantidad] of Object.entries(
        seleccionSonidos
    )) {

        if (!/^p_[1-9]\d*$/.test(clave)) {

            throw errorHttp(
                400,
                'Equipo de sonido inválido.',
                'error_sonido'
            );
        }

        sonidos.push({

            id: validarEntero(
                clave.substring(2),
                1,
                'error_sonido'
            ),

            cantidad: validarEntero(
                cantidad,
                1,
                'error_sonido'
            )

        });
    }

    // DATOS DEL PAQUETE

    return {

        tipo_paquete_id: validarEntero(
            body.tipo_paquete_id,
            1,
            'error_tipo'
        ),

        nombre,

        descripcion: descripcion || null,

        precio_adicional: validarPrecio(
            body.precio_adicional,
            'error_precio'
        ),

        min_invitados,
        max_invitados,

        porciones_incluidas: validarEntero(
            body.porciones_incluidas ?? '0',
            0,
            'error_porciones'
        ),

        valor_porcion_incluida: validarPrecio(
            body.valor_porcion_incluida ?? '0',
            'error_valor_porcion'
        ),

        manteles_incluidos: validarEntero(
            body.manteles_incluidos ?? '0',
            0,
            'error_manteles'
        ),

        cantidad_meseros: validarEntero(
            body.cantidad_meseros ?? '0',
            0,
            'error_meseros'
        ),

        salones,
        sonidos
    };
}

// ========================================
// CLOUDINARY
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
            'Fotografía inválida.',
            'error_imagen'
        );
    }

    return new Promise((resolve, reject) => {

        const stream = cloudinary.uploader.upload_stream(

            {
                public_id: `${CARPETA}/${randomUUID()}`,
                resource_type: 'image',
                overwrite: false,

                allowed_formats: [
                    'jpg',
                    'jpeg',
                    'png',
                    'webp'
                ]
            },

            (error, resultado) => {

                if (error) {
                    return reject(error);
                }

                resolve(resultado);
            }
        );

        stream.end(archivo.buffer);
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
            'Error al eliminar fotografía:',
            error
        );
    }
}

// ========================================
// MANEJO DE ERRORES
// ========================================

function manejarError(res, error) {

    if (error.code === 'ER_DUP_ENTRY') {
        error.status = 409;
    }

    if (
        error.codigoAviso &&
        (
            Object.prototype.hasOwnProperty.call(
                MENSAJES,
                error.codigoAviso
            ) ||
            error.codigoAviso === 'error_imagen'
        )
    ) {

        console.error(
            'ERROR DE PAQUETES:',
            error.message
        );

        return res.redirect(
            303,
            `${RUTA}?aviso=${encodeURIComponent(
                error.codigoAviso
            )}`
        );
    }

    return Avisos.error(res, error, RUTA);
}

// ========================================
// CONTROLADOR
// ========================================

class PaquetesController {

    // ========================================
    // CATÁLOGO PÚBLICO
    // ========================================

    static async obtenerCatalogoPublico(req, res) {

        try {

            const [resultado, catalogos] = await Promise.all([

                PaquetesModel.obtenerTodos(),

                PaquetesModel.obtenerCatalogos()

            ]);

            const salonesActivos = new Set(

                catalogos.salones
                    .filter(s => Number(s.activo) === 1)
                    .map(s => Number(s.id))

            );

            const paquetes = resultado

                .filter(p => Number(p.activo) === 1)

                .map(p => ({

                    ...p,

                    salones: p.salones.filter(s =>
                        salonesActivos.has(Number(s.salon_id))
                    )

                }))

                .filter(p => p.salones.length > 0)

                .filter(p => {

                    if (
                        p.tipo.toLowerCase().trim() === 'preparado'
                    ) {

                        return (
                            Number(p.porciones_incluidas) > 0 &&
                            Number(p.manteles_incluidos) > 0 &&
                            Number(p.valor_porcion_incluida) > 0
                        );
                    }

                    return true;

                });

            return res.render('PaquetesPublico', {

                user: req.user,
                paquetes,
                error: null

            });

        } catch (error) {

            console.error(
                'Error al cargar catálogo:',
                error
            );

            return res.status(500).render(
                'PaquetesPublico',
                {
                    user: req.user,
                    paquetes: [],
                    error: 'No se pudieron cargar los paquetes.'
                }
            );
        }
    }

    // ========================================
    // LISTAR PAQUETES
    // ========================================

    static async listar(req, res) {

        try {

            const [resultado, catalogos] = await Promise.all([

                PaquetesModel.obtenerTodos(),

                PaquetesModel.obtenerCatalogos()

            ]);

            const busqueda =
                typeof req.query.buscar === 'string'
                    ? req.query.buscar.trim()
                    : '';

            const termino = busqueda.toLowerCase();

            const paquetes = resultado.filter(paquete =>

                paquete.nombre.toLowerCase().includes(termino) ||

                paquete.tipo.toLowerCase().includes(termino)

            );

            return res.render('AdminPaquetes', {

                user: req.user,

                paquetes,
                busqueda,

                ...catalogos,

                ...Avisos.obtener(req, MENSAJES)

            });

        } catch (error) {

            console.error(
                'Error al listar paquetes:',
                error
            );

            return res.status(500).render('AdminPaquetes', {

                user: req.user,

                paquetes: [],
                tipos: [],
                salones: [],
                sonidos: [],

                busqueda: '',

                aviso: 'No se pudieron cargar los paquetes.',
                tipoAviso: 'error'

            });
        }
    }

    // ========================================
    // CREAR
    // ========================================

    static async crear(req, res) {

        let subida = null;

        try {

            const datos = prepararDatos(req.body);

            if (req.file) {

                subida = await subirImagen(req.file);

                datos.imagen_url = subida.secure_url;
                datos.imagen_public_id = subida.public_id;
            }

            await PaquetesModel.guardar(
                null,
                datos
            );

        } catch (error) {

            if (subida) {

                await eliminarDeCloudinary(
                    subida.public_id
                );
            }

            return manejarError(res, error);
        }

        return Avisos.exito(
            res,
            RUTA,
            'creado'
        );
    }

    // ========================================
    // ACTUALIZAR
    // ========================================

    static async actualizar(req, res) {

        let subida = null;
        let resultado = null;

        try {

            const id = validarEntero(req.params.id);

            const datos = prepararDatos(req.body);

            if (req.file) {

                subida = await subirImagen(req.file);

                datos.imagen_url = subida.secure_url;
                datos.imagen_public_id = subida.public_id;
            }

            resultado = await PaquetesModel.guardar(
                id,
                datos
            );

        } catch (error) {

            if (subida) {

                await eliminarDeCloudinary(
                    subida.public_id
                );
            }

            return manejarError(res, error);
        }

        if (subida && resultado.imagenAnterior) {

            await eliminarDeCloudinary(
                resultado.imagenAnterior
            );
        }

        return Avisos.exito(
            res,
            RUTA,
            'actualizado'
        );
    }

    // ========================================
    // ACTIVAR O DESACTIVAR
    // ========================================

    static async cambiarActivo(req, res) {

        try {

            const id = validarEntero(req.params.id);

            const activo = String(req.body?.activo);

            if (!['0', '1'].includes(activo)) {

                throw errorHttp(
                    400,
                    'Estado inválido.'
                );
            }

            const actualizado =
                await PaquetesModel.cambiarActivo(
                    id,
                    activo === '1'
                );

            if (!actualizado) {

                throw errorHttp(
                    404,
                    'Paquete no encontrado.'
                );
            }

            return Avisos.exito(
                res,
                RUTA,
                'estado_actualizado'
            );

        } catch (error) {

            return manejarError(res, error);
        }
    }

    // ========================================
    // ELIMINAR FOTOGRAFÍA
    // ========================================

    static async eliminarImagen(req, res) {

        try {

            const id = validarEntero(req.params.id);

            const publicId =
                await PaquetesModel.eliminarImagen(id);

            await eliminarDeCloudinary(publicId);

            return Avisos.exito(
                res,
                RUTA,
                'imagen_eliminada'
            );

        } catch (error) {

            return manejarError(res, error);
        }
    }
}

module.exports = PaquetesController;