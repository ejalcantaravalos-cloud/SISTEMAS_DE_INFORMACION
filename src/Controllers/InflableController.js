const InflableModel = require('../models/inflableModel');
const cloudinary = require('../Database/Cloudinary');

// SUBIR FOTOGRAFÍA A CLOUDINARY
function subirImagen(buffer) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'imagenesHelpingBee',
                resource_type: 'image'
            },
            (error, resultado) => {
                if (error) return reject(error);
                resolve(resultado);
            }
        );

        stream.end(buffer);
    });
}

// CREAR ERRORES CON UN CÓDIGO HTTP
function errorHttp(codigo, mensaje) {
    const error = new Error(mensaje);
    error.status = codigo;
    return error;
}

// VALIDAR DATOS PARA CREAR Y ACTUALIZAR

function prepararDatos(body) {
    const {
        nombre,
        largo_m,
        ancho_m,
        alto_m,
        requisitos_instalacion,
        precio_completo,
        descripcion_imagen
    } = body;

    // Validar nombre
    if (typeof nombre !== 'string' || !nombre.trim()) {
        throw errorHttp(
            400,
            'El nombre del inflable es obligatorio.'
        );
    }

    // Convertir medidas
    const convertirMedida = (valor) => {
        if (valor == null || String(valor).trim() === '') {
            return null;
        }

        return Number(valor);
    };

    const largo = convertirMedida(largo_m);
    const ancho = convertirMedida(ancho_m);
    const alto = convertirMedida(alto_m);

    // Validar medidas
    if ([largo, ancho, alto].some(m =>
        m !== null && (!Number.isFinite(m) || m <= 0)
    )) {
        throw errorHttp(
            400,
            'Las medidas deben ser números mayores a cero.'
        );
    }

    // Validar precio completo
    if (
        precio_completo == null ||
        String(precio_completo).trim() === ''
    ) {
        throw errorHttp(
            400,
            'El precio completo es obligatorio.'
        );
    }

    const precio = Number(precio_completo);

    if (!Number.isFinite(precio) || precio < 0) {
        throw errorHttp(
            400,
            'El precio completo debe ser un número válido.'
        );
    }

    // Devolver datos preparados
    return {
        nombre: nombre.trim(),
        largo,
        ancho,
        alto,
        requisitos: typeof requisitos_instalacion === 'string'
            ? requisitos_instalacion.trim() || null
            : null,
        precio_completo: precio,
        descripcionImagen: typeof descripcion_imagen === 'string'
            ? descripcion_imagen.trim() || null
            : null
    };
}

// CONTROLADOR DE INFLABLES
class InflableController {

    // LISTAR INFLABLES PARA ADMINISTRACIÓN

static async listar(req, res) {
    try {
        const inflables = await InflableModel.obtenerTodos();

        const mensajes = {
            estado_actualizado: 'Estado actualizado correctamente.',
            revision_actualizada: 'Revisión registrada correctamente.',
            eliminado: 'Inflable eliminado correctamente.',
            con_historial:
                'No se puede eliminar porque tiene reservaciones o revisiones asociadas. Puedes desactivarlo.'
        };

        const aviso = mensajes[req.query.aviso] || null;

        return res.render('adminInflables', {
            user: req.user,
            inflables,
            aviso
        });

    } catch (error) {
        console.error('Error al listar inflables:', error);

        return res.status(500).render('adminInflables', {
            user: req.user,
            inflables: [],
            aviso: null
        });
    }
}


// HABILITAR O DESHABILITAR INFLABLE
static async cambiarActivo(req, res) {
    try {
        const id = Number(req.params.id);
        const activo = String(req.body?.activo);

        if (
            !Number.isSafeInteger(id) ||
            id <= 0 ||
            !['0', '1'].includes(activo)
        ) {
            return res.status(400).send(
                'Datos inválidos para cambiar el estado.'
            );
        }

        const actualizado = await InflableModel.cambiarActivo(
            id,
            activo === '1'
        );

        if (!actualizado) {
            return res.status(404).send(
                'No se encontró el inflable.'
            );
        }

        return res.redirect(
            '/admin/inflables?aviso=estado_actualizado'
        );

    } catch (error) {
        console.error('Error al cambiar estado:', error);

        return res.status(500).send(
            'No se pudo cambiar el estado.'
        );
    }
}

    // CATÁLOGO PÚBLICO
    static async obtenerCatalogoPublico(req, res) {
        try {
            const todos = await InflableModel.obtenerTodos();

            // Mostrar únicamente los inflables habilitados
            const inflables = todos.filter(
                inflable => Number(inflable.activo) === 1
            );

            return res.render('inflablesPublico', {
                user: req.user,
                inflables
            });

        } catch (error) {
            console.error('Error al cargar catálogo:', error);

            return res.status(500).render('inflablesPublico', {
                user: req.user,
                inflables: []
            });
        }
    }


    // CREAR INFLABLE CON FOTOGRAFÍA
    static async crear(req, res) {
        let subida = null;

        try {
            // Obtener y validar datos del formulario
            const datos = prepararDatos(req.body);

            // Subir fotografía a Cloudinary si fue seleccionada
            if (req.file) {
                subida = await subirImagen(req.file.buffer);
            }

            // Registrar inflable y fotografía en MySQL
            await InflableModel.crear(
                datos.nombre,
                datos.largo,
                datos.ancho,
                datos.alto,
                datos.requisitos,
                datos.precio_completo,
                subida?.secure_url || null,
                datos.descripcionImagen
            );

            return res.redirect('/admin/inflables');

        } catch (error) {
            console.error('Error al registrar inflable:', error);

            // Eliminar imagen si falló el registro en MySQL
            if (subida?.public_id) {
                try {
                    await cloudinary.uploader.destroy(
                        subida.public_id
                    );

                } catch (errorNube) {
                    console.error(
                        'Error al revertir imagen:',
                        errorNube
                    );
                }
            }

            // Errores de validación
            if (error.status === 400) {
                return res.status(400).send(error.message);
            }

            return res.status(500).send(
                'No se pudo registrar el inflable.'
            );
        }
    }


    // ELIMINAR INFLABLE

static async eliminar(req, res) {
    try {
        const id = Number(req.params.id);

        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).send('ID inválido.');
        }

        const eliminado = await InflableModel.eliminar(id);

        if (!eliminado) {
            return res.status(404).send(
                'No se encontró el inflable.'
            );
        }

        return res.redirect(
            '/admin/inflables?aviso=eliminado'
        );

    } catch (error) {
        console.error('Error al eliminar inflable:', error);

        if (
            error.code === 'ER_ROW_IS_REFERENCED_2' ||
            error.errno === 1451
        ) {
            return res.redirect(
                '/admin/inflables?aviso=con_historial'
            );
        }

        return res.status(500).send(
            'No se pudo eliminar el inflable.'
        );
    }
}


    // ACTUALIZAR INFLABLE
    static async actualizar(req, res) {
        let subida = null;

        try {
            const id = Number(req.params.id);

            // Validar ID
            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).send('ID inválido.');
            }

            // Obtener y validar los nuevos datos
            const datos = prepararDatos(req.body);

            // Comprobar que exista el inflable
            const existente = await InflableModel.obtenerPorId(id);

            if (!existente) {
                return res.status(404).send(
                    'No se encontró el inflable.'
                );
            }

            // Subir imagen nueva solamente si fue seleccionada
            if (req.file) {
                subida = await subirImagen(req.file.buffer);
            }

            // Actualizar datos en MySQL
            const actualizado = await InflableModel.actualizar(
                id,
                datos.nombre,
                datos.largo,
                datos.ancho,
                datos.alto,
                datos.requisitos,
                datos.precio_completo,
                subida?.secure_url || null,
                datos.descripcionImagen
            );

            if (!actualizado) {
                throw errorHttp(
                    404,
                    'No se encontró el inflable.'
                );
            }

            return res.redirect('/admin/inflables');

        } catch (error) {
            console.error('Error al actualizar inflable:', error);

            // Eliminar la nueva imagen si falló la actualización
            if (subida?.public_id) {
                try {
                    await cloudinary.uploader.destroy(
                        subida.public_id
                    );

                } catch (errorNube) {
                    console.error(
                        'Error al revertir imagen nueva:',
                        errorNube
                    );
                }
            }

            // Errores de validación o registro inexistente
            if (error.status === 400 || error.status === 404) {
                return res.status(error.status).send(
                    error.message
                );
            }

            return res.status(500).send(
                'Error al actualizar el inflable.'
            );
        }
    }
}


module.exports = InflableController;
