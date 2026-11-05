const Imagen = require('../models/imagenModelo');
const cloudinary = require('../Database/Cloudinary');

const modelImagen = new Imagen();

// Subir imagen a Cloudinary
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

// Obtener todas las imágenes
async function getAll(req, res) {
    try {
        const imagenes = await modelImagen.obtenerTodos();
        return res.status(200).json(imagenes);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al obtener imágenes' });
    }
}

// Buscar imagen por título
async function getByTitle(req, res) {
    try {
        const titulo = req.query.titulo;

        if (!titulo) {
            return res.status(400).json({ error: 'Falta el título' });
        }

        const imagen = await modelImagen.obtenerPorTitulo(titulo);

        if (!imagen) {
            return res.status(404).json({ error: 'Imagen no encontrada' });
        }

        return res.status(200).json(imagen);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al buscar imagen' });
    }
}

// Crear imagen
async function create(req, res) {
    const titulo = req.body.Titulo?.trim();
    const imagen = req.file;

    if (!titulo || !imagen) {
        return res.status(400).json({
            error: 'Faltan datos: título o imagen'
        });
    }

    if (titulo.length > 100) {
        return res.status(400).json({ error: 'Título demasiado largo' });
    }

    let subida = null;

    try {
        const existente = await modelImagen.obtenerPorTitulo(titulo);

        if (existente) {
            return res.status(409).json({
                error: 'Ya existe una imagen con ese título'
            });
        }

        subida = await subirImagen(imagen.buffer);

        await modelImagen.crearImagen(
            titulo,
            subida.secure_url,
            subida.public_id
        );

        return res.status(201).json({
            message: 'Imagen creada correctamente',
            data: {
                Titulo: titulo,
                Imagen_URL: subida.secure_url
            }
        });

    } catch (error) {
        if (subida) {
            await cloudinary.uploader.destroy(subida.public_id)
                .catch(console.error);
        }

        console.error(error);
        return res.status(500).json({
            error: 'Error al crear imagen'
        });
    }
}

// Eliminar imagen
async function eliminar(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID inválido' });
    }

    try {
        const imagen = await modelImagen.obtenerPorId(id);

        if (!imagen) {
            return res.status(404).json({
                error: 'Imagen no encontrada'
            });
        }

        await cloudinary.uploader.destroy(imagen.Public_ID);
        const borrado = await modelImagen.eliminar(id);

        if (!borrado) {
            return res.status(500).json({
                error: 'No se pudo eliminar el registro'
            });
        }

        return res.status(200).json({
            message: 'Imagen eliminada correctamente'
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            error: 'Error al eliminar imagen'
        });
    }
}

// Actualizar imagen
async function update(req, res) {
    const id = Number(req.params.id);
    const titulo = req.body.Titulo?.trim();
    const nuevaImagen = req.file;

    if (!Number.isInteger(id) || id <= 0 || !titulo || titulo.length > 100) {
        return res.status(400).json({
            error: 'ID o título inválido'
        });
    }

    let subida = null;

    try {
        const actual = await modelImagen.obtenerPorId(id);

        if (!actual) {
            return res.status(404).json({
                error: 'La imagen no existe'
            });
        }

        const existente = await modelImagen.obtenerPorTitulo(titulo);

        if (existente && existente.ID_Imagen !== id) {
            return res.status(409).json({
                error: 'Ya existe otra imagen con ese título'
            });
        }

        let urlFinal = actual.Imagen_URL;
        let publicIdFinal = actual.Public_ID;

        if (nuevaImagen) {
            subida = await subirImagen(nuevaImagen.buffer);
            urlFinal = subida.secure_url;
            publicIdFinal = subida.public_id;
        }

        await modelImagen.actualizar(
            id, titulo, urlFinal, publicIdFinal
        );

        // Eliminar la imagen anterior después de actualizar MySQL
        if (subida && actual.Public_ID) {
            try {
                await cloudinary.uploader.destroy(actual.Public_ID);
            } catch (error) {
                console.warn('No se eliminó la imagen anterior:', error);
            }
        }

        return res.status(200).json({
            message: 'Imagen actualizada correctamente'
        });

    } catch (error) {
        if (subida) {
            await cloudinary.uploader.destroy(subida.public_id)
                .catch(console.error);
        }

        console.error(error);
        return res.status(500).json({
            error: 'Error al actualizar imagen'
        });
    }
}

module.exports = {
    getAll,
    getByTitle,
    create,
    update,
    eliminar
};
