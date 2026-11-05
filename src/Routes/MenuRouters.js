
const express = require('express');
const multer = require('multer');

const router = express.Router();

const menuController = require('../Controllers/MenuController');
const productController = require('../Controllers/ProductController');
const authController = require('../Controllers/AuthController');


// CONFIGURACIÓN DE MULTER


const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    },

    fileFilter: (req, file, cb) => {
        const formatosPermitidos = [
            'image/jpeg',
            'image/png',
            'image/webp'
        ];

        if (formatosPermitidos.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de imagen no permitido'));
        }
    }
});



// SEGURIDAD


// Nunca permitir acceso administrativo sin autenticación.
if (typeof authController.isAuthenticated === 'function') {
    router.use(authController.isAuthenticated);
} else {
    router.use((req, res) => {
        console.error(
            'No se encontró el middleware isAuthenticated'
        );

        res.status(503).send(
            'La autenticación administrativa no está configurada.'
        );
    });
}



// MENÚS Y CATEGORÍAS


router.get(
    '/categorias',
    menuController.listarCategorias
);

router.post(
    '/categorias/crear',
    menuController.crearCategoria
);

router.get(
    '/categorias/eliminar/:id',
    menuController.eliminarCategoria
);


// Mostrar productos
router.get(
    '/productos',
    productController.listarProductos
);

// Activar o desactivar producto
router.get(
    '/productos/toggle/:id',
    productController.toggleProducto
);

// Marcar o quitar especial
router.get(
    '/productos/especial/:id',
    productController.toggleEspecial
);

// Eliminar producto
router.post(
    '/productos/eliminar/:id',
    productController.EliminarProducto
);

// Crear producto con fotografía
router.post(
    '/productos/crear',
    upload.single('imagen'),
    productController.crearProducto
);

// Editar producto con fotografía opcional
router.post(
    '/productos/editar/:id',
    upload.single('imagen'),
    productController.actualizarProducto
);


// MANEJADOR DE ERRORES DE MULTER


router.use((error, req, res, next) => {

    if (
        error instanceof multer.MulterError ||
        error.message === 'Formato de imagen no permitido'
    ) {
        return res.status(400).send(
            'Error al subir la fotografía: ' + error.message
        );
    }

    next(error);
});



module.exports = router;
