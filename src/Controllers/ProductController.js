const conexion = require('../Database/db');

exports.listarProductos = (req, res) => {
    const queryProductos = `
        SELECT p.*, c.nombre AS categoria_nombre 
        FROM producto p 
        LEFT JOIN categoria c ON p.categoria_id = c.id
    `;
    
    conexion.query(queryProductos, (error, productos) => {
        if (error) productos = [];

        conexion.query('SELECT * FROM categoria', (err, categorias) => {
            if (err) categorias = [];

            res.render('adminProductos', { 
                user: req.user, 
                productos, 
                categorias 
            });
        });
    });
};

exports.crearProducto = (req, res) => {
    const { nombre, precio, stock, categoria_id } = req.body;
    const query = `
        INSERT INTO producto (nombre, precio, stock, categoria_id, activo, especial) 
        VALUES (?, ?, ?, ?, TRUE, FALSE)
    `;
    
    conexion.query(query, [nombre, precio, stock || 0, categoria_id || null], (error) => {
        if (error) console.log("Error al crear producto:", error);
        res.redirect('/admin/menu/productos');
    });
};

exports.toggleProducto = (req, res) => {
    const id = req.params.id;
    conexion.query('SELECT activo FROM producto WHERE id = ?', [id], (error, results) => {
        if (error || results.length === 0) return res.redirect('/admin/menu/productos');
        
        const nuevoEstado = !results[0].activo;
        conexion.query('UPDATE producto SET activo = ? WHERE id = ?', [nuevoEstado, id], () => {
            res.redirect('/admin/menu/productos');
        });
    });
};

exports.toggleEspecial = (req, res) => {
    const id = req.params.id;
    conexion.query('SELECT especial FROM producto WHERE id = ?', [id], (error, results) => {
        if (error || results.length === 0) return res.redirect('/admin/menu/productos');
        
        const nuevoEspecial = !results[0].especial;
        conexion.query('UPDATE producto SET especial = ? WHERE id = ?', [nuevoEspecial, id], () => {
            res.redirect('/admin/menu/productos');
        });
    });
};