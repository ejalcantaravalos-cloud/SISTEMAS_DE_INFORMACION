
const conexion = require('../Database/db');
const db = conexion.promise();

const Imagen = require('../models/imagenModelo');
const cloudinary = require('../Database/Cloudinary');

const modeloImagen = new Imagen();

// Subir fotografía a Cloudinary
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

// LISTAR PRODUCTOS PARA ADMINISTRADOR
exports.listarProductos = (req, res) => {
    const queryProductos = `
        SELECT p.*, c.nombre AS categoria_nombre
        FROM producto p
        LEFT JOIN categoria c ON p.categoria_id = c.id
    `;

    conexion.query(queryProductos, (error, productos) => {
        if (error) {
            console.error(error);
            productos = [];
        }

        conexion.query('SELECT * FROM categoria', (err, categorias) => {
            if (err) {
                console.error(err);
                categorias = [];
            }

            res.render('adminProductos', {
                user: req.user,
                productos,
                categorias
            });
        });
    });
};

// CREAR PRODUCTO CON FOTOGRAFÍA
exports.crearProducto = async (req, res) => {
    const { nombre, precio, stock, categoria_id } = req.body;

    let idNuevo = null;
    let subida = null;

    try {
        if (!nombre?.trim() || precio === undefined ||
            precio === '' || Number(precio) < 0 ||
            !Number.isFinite(Number(precio)) ||
            Number(stock) < 0) {
            return res.status(400).send('Datos del platillo inválidos.');
        }

        // Registrar el producto
        const [resultado] = await db.query(
            `INSERT INTO producto
             (nombre, precio, stock, categoria_id, activo, especial)
             VALUES (?, ?, ?, ?, TRUE, FALSE)`,
            [nombre.trim(), precio, stock || 0, categoria_id || null]
        );

        // Obtener el ID generado por MySQL
        idNuevo = resultado.insertId;

        // Si seleccionó una imagen
        if (req.file) {
            subida = await subirImagen(req.file.buffer);

            const tituloImagen = `platillo-${idNuevo}`;

            // Guardar referencia en la tabla Imagen
            await modeloImagen.crearImagen(
                tituloImagen,
                subida.secure_url,
                subida.public_id
            );
        }

        return res.redirect('/admin/menu/productos');

    } catch (error) {
        console.error('Error al crear producto:', error);

        // Revertir fotografía si se subió
        if (subida?.public_id) {
            try {
                await cloudinary.uploader.destroy(subida.public_id);
            } catch (e) {
                console.error('Error al revertir imagen:', e);
            }
        }

        // Revertir producto si se creó
        if (idNuevo) {
            try {
                await db.query(
                    'DELETE FROM producto WHERE id = ?',
                    [idNuevo]
                );
            } catch (e) {
                console.error('Error al revertir producto:', e);
            }
        }

        return res.status(500).send(
            'No se pudo crear el platillo. Revisa los logs.'
        );
    }
};

// ACTUALIZAR PRODUCTO Y OPCIONALMENTE SU IMAGEN
exports.actualizarProducto = async (req, res) => {
    const id = Number(req.params.id);
    const { nombre, precio, stock, categoria_id } = req.body;

    let subida = null;

    try {
        if (!Number.isInteger(id) || id <= 0 ||
            !nombre?.trim() || precio === undefined ||
            precio === '' || Number(precio) < 0 ||
            !Number.isFinite(Number(precio)) ||
            Number(stock) < 0) {
            return res.status(400).send('Datos inválidos.');
        }

        const [productos] = await db.query(
            'SELECT id FROM producto WHERE id = ?',
            [id]
        );

        if (productos.length === 0) {
            return res.status(404).send('Platillo no encontrado.');
        }

        const tituloImagen = `platillo-${id}`;
        let imagenAnterior = null;

        // Si hay una nueva fotografía, prepararla
        if (req.file) {
            imagenAnterior = await modeloImagen.obtenerPorTitulo(
                tituloImagen
            );

            subida = await subirImagen(req.file.buffer);
        }

        // Actualizar datos del producto
        await db.query(
            `UPDATE producto
             SET nombre = ?, precio = ?, stock = ?, categoria_id = ?
             WHERE id = ?`,
            [nombre.trim(), precio, stock || 0, categoria_id || null, id]
        );

        // Actualizar o agregar la fotografía
        if (subida) {
            if (imagenAnterior) {
                await modeloImagen.actualizar(
                    imagenAnterior.ID_Imagen,
                    tituloImagen,
                    subida.secure_url,
                    subida.public_id
                );
            } else {
                await modeloImagen.crearImagen(
                    tituloImagen,
                    subida.secure_url,
                    subida.public_id
                );
            }

            // Eliminar fotografía anterior de Cloudinary
            if (imagenAnterior?.Public_ID) {
                try {
                    await cloudinary.uploader.destroy(
                        imagenAnterior.Public_ID
                    );
                } catch (e) {
                    console.warn(
                        'No se pudo eliminar fotografía anterior:', e
                    );
                }
            }
        }

        return res.redirect('/admin/menu/productos');

    } catch (error) {
        console.error('Error al actualizar producto:', error);

        if (subida?.public_id) {
            try {
                await cloudinary.uploader.destroy(subida.public_id);
            } catch (e) {
                console.error('Error al revertir imagen:', e);
            }
        }

        return res.status(500).send(
            'No se pudo actualizar el platillo.'
        );
    }
};

// ACTIVAR O DESACTIVAR
exports.toggleProducto = (req, res) => {
    const id = req.params.id;

    conexion.query(
        'SELECT activo FROM producto WHERE id = ?',
        [id],
        (error, results) => {
            if (error || results.length === 0) {
                return res.redirect('/admin/menu/productos');
            }

            const nuevoEstado = !results[0].activo;

            conexion.query(
                'UPDATE producto SET activo = ? WHERE id = ?',
                [nuevoEstado, id],
                () => res.redirect('/admin/menu/productos')
            );
        }
    );
};

// MARCAR COMO ESPECIAL
exports.toggleEspecial = (req, res) => {
    const id = req.params.id;

    conexion.query(
        'SELECT especial FROM producto WHERE id = ?',
        [id],
        (error, results) => {
            if (error || results.length === 0) {
                return res.redirect('/admin/menu/productos');
            }

            const nuevoEspecial = !results[0].especial;

            conexion.query(
                'UPDATE producto SET especial = ? WHERE id = ?',
                [nuevoEspecial, id],
                () => res.redirect('/admin/menu/productos')
            );
        }
    );
};

// ELIMINAR PRODUCTO
exports.EliminarProducto = (req, res) => {
    const id = req.params.id;

    conexion.query(
        'DELETE FROM producto WHERE id = ?',
        [id],
        (error) => {
            if (error) {
                console.error('Error al eliminar producto:', error);

                return res.status(500).send(
                    'No se pudo eliminar. Puede tener órdenes relacionadas.'
                );
            }

            res.redirect('/admin/menu/productos');
        }
    );
};

// CATÁLOGO PÚBLICO DEL RESTAURANTE
exports.catalogoPublico = (req, res) => {
    const query = `
        SELECT
            p.id,
            p.nombre,
            p.precio,
            p.stock,
            p.especial,
            c.nombre AS categoria_nombre
        FROM producto p
        LEFT JOIN categoria c ON p.categoria_id = c.id
        WHERE p.activo = 1
        ORDER BY c.nombre, p.nombre
    `;

    conexion.query(query, (error, productos) => {
        if (error) {
            console.error('Error al cargar menú público:', error);

            return res.status(500).send(
                'No se pudo cargar el menú del restaurante.'
            );
        }

        res.render('restaurantePublico', { productos });
    });
};
