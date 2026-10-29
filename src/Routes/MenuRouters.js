const express = require('express');
const router = express.Router();

const menuController = require('../Controllers/MenuController');
const productController = require('../Controllers/ProductController');
const authController = require('../Controllers/AuthController');

// Middleware de seguridad por si existe
if (authController && authController.isAuthenticated) {
    router.use(authController.isAuthenticated);
}

//  Menús / Categorías
router.get('/categorias', menuController.listarCategorias);
router.post('/categorias/crear', menuController.crearCategoria);
router.get('/categorias/eliminar/:id', menuController.eliminarCategoria);


//  Platillos / Productos
router.get('/productos', productController.listarProductos);
router.post('/productos/crear', productController.crearProducto);
router.get('/productos/toggle/:id', productController.toggleProducto);
router.get('/productos/especial/:id', productController.toggleEspecial);

module.exports = router;