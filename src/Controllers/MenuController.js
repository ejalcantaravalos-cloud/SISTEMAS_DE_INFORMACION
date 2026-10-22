const conexion = require('../Database/db');

exports.listarCategorias = (req, res) => {
    conexion.query('SELECT * FROM categoria', (error, categorias) => {
        if (error) categorias = [];
        res.render('adminCategorias', { user: req.user, categorias });
    });
};

exports.crearCategoria = (req, res) => {
    const { nombre, descripcion } = req.body;
    conexion.query('INSERT INTO categoria (nombre, descripcion) VALUES (?, ?)', [nombre, descripcion || ''], () => {
        res.redirect('/admin/menu/categorias');
    });
};

exports.eliminarCategoria = (req, res) => {
    const id = req.params.id;
    conexion.query('DELETE FROM categoria WHERE id = ?', [id], () => {
        res.redirect('/admin/menu/categorias');
    });
};

//  Consulta: Vista pública del menú para clientes
exports.verMenuPublico = (req, res) => {
    const queryCategorias = 'SELECT * FROM categoria';
    const queryProductos = 'SELECT * FROM producto WHERE activo = TRUE';

    conexion.query(queryCategorias, (errorCat, categorias) => {
        if (errorCat) categorias = [];

        conexion.query(queryProductos, (errorProd, productos) => {
            if (errorProd) productos = [];

            res.render('MenuPublico', { 
                categorias, 
                productos 
            });
        });
    });
};