'use strict';
const express = require('express');
const multer = require('multer');
const router = express.Router();
const authController = require('../Controllers/AuthController');
const PlatilloController = require('../Controllers/PlatilloController');

const subir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const aceptados = ['image/jpeg', 'image/png', 'image/webp'];
    if (aceptados.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Usa imágenes JPG, PNG o WEBP.'));
  }
});

router.use(authController.hasRole('Administrador'));
router.get('/', PlatilloController.listarProductos);
router.post('/', subir.single('imagen'), PlatilloController.crearProducto);
router.post('/:id/editar', subir.single('imagen'), PlatilloController.actualizarProducto);
router.post('/:id/estado', PlatilloController.toggleProducto);
router.post('/:id/destacar', PlatilloController.toggleEspecial);
router.post('/:id/desactivar', PlatilloController.EliminarProducto);

module.exports = router;
