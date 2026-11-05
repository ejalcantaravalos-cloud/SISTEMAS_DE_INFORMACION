const InflableModel = require('../models/inflableModel');
const Imagen = require('../models/imagenModelo');
const cloudinary = require('../Database/Cloudinary');

const modeloImagen = new Imagen();

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


// CONTROLADOR DE INFLABLES


class InflableController {

    // LISTAR INFLABLES PARA ADMINISTRACIÓN
    static async listar(req, res) {
        try {
            const inflables = await InflableModel.obtenerTodos();

            return res.render('adminInflables', {
                user: req.user,
                inflables
            });

        } catch (error) {
            console.error('Error al listar inflables:', error);

            return res.status(500).render('adminInflables', {
                user: req.user,
                inflables: []
            });
        }
    }


    // CATÁLOGO PÚBLICO
    static async obtenerCatalogoPublico(req, res) {
        try {
            const inflables = await InflableModel.obtenerTodos();

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
        let idNuevo = null;
        let subida = null;

        try {
            const {
                nombre,
                medidas_espacio,
                estado_disponibilidad
            } = req.body;

            if (!nombre?.trim() || !medidas_espacio?.trim()) {
                return res.status(400).send(
                    'El nombre y las medidas son obligatorios.'
                );
            }

            // Registrar inflable en MySQL
            idNuevo = await InflableModel.crear(
                nombre.trim(),
                medidas_espacio.trim(),
                estado_disponibilidad
            );

            // Registrar fotografía si fue seleccionada
            if (req.file) {
                subida = await subirImagen(req.file.buffer);

                const tituloImagen = `inflable-${idNuevo}`;

                await modeloImagen.crearImagen(
                    tituloImagen,
                    subida.secure_url,
                    subida.public_id
                );
            }

            return res.redirect('/admin/inflables');

        } catch (error) {
            console.error('Error al registrar inflable:', error);

            // Revertir imagen subida si ocurrió un error
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

            // Revertir el inflable creado
            if (idNuevo) {
                try {
                    await InflableModel.eliminar(idNuevo);
                } catch (errorBD) {
                    console.error(
                        'Error al revertir inflable:',
                        errorBD
                    );
                }
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

            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).send('ID inválido.');
            }

            await InflableModel.eliminar(id);

            return res.redirect('/admin/inflables');

        } catch (error) {
            console.error('Error al eliminar inflable:', error);

            return res.status(500).send(
                'No se pudo eliminar el inflable.'
            );
        }
    }


    // ACTUALIZAR INFLABLE
    static async actualizar(req, res) {
        try {
            const id = Number(req.params.id);

            const {
                nombre,
                medidas_espacio,
                estado_disponibilidad
            } = req.body;

            // Mensajes para identificar el problema
            console.log('=== EDITAR INFLABLE ===');
            console.log('ID recibido:', id);
            console.log('Nombre:', nombre);
            console.log('Medidas:', medidas_espacio);
            console.log('Estado:', estado_disponibilidad);

            // Validar datos
            const estadosPermitidos = [
                'disponible',
                'rentado',
                'requiere limpieza',
                'mantenimiento'
            ];

            if (
                !Number.isInteger(id) ||
                id <= 0 ||
                !nombre?.trim() ||
                !medidas_espacio?.trim() ||
                !estadosPermitidos.includes(estado_disponibilidad)
            ) {
                return res.status(400).send(
                    'Los datos del inflable no son válidos.'
                );
            }

            // Actualizar datos en MySQL
            const actualizado = await InflableModel.actualizar(
                id,
                nombre.trim(),
                medidas_espacio.trim(),
                estado_disponibilidad
            );

            console.log('Resultado de actualización:', actualizado);

            if (!actualizado) {
                return res.status(404).send(
                    'No se encontró el inflable.'
                );
            }

            console.log('Inflable actualizado correctamente.');

            return res.redirect('/admin/inflables');

        } catch (error) {
            console.error('Error al actualizar inflable:', error);

            return res.status(500).send(
                'Error al actualizar el inflable.'
            );
        }
    }
}

module.exports = InflableController;
