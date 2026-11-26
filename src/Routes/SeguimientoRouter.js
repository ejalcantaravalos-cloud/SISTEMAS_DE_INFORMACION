'use strict';

const express = require('express');
const router = express.Router();
const authController = require('../Controllers/AuthController');
const seguimientoController = require('../Controllers/SeguimientoController');

// Los nombres de los roles corresponden a tu tabla "rol".
const accesoCocina = authController.hasRole(['Cocina', 'Administrador']);
const accesoMesero = authController.hasRole(['Mesero', 'Administrador']);

// Este router se monta en /ordenes desde app.js.
router.get('/cocina', accesoCocina, seguimientoController.mostrarCocina);
router.post('/cocina/:id/tomar', accesoCocina, seguimientoController.tomarPedido);
router.post('/cocina/:id/completar', accesoCocina, seguimientoController.completarPedido);

router.get('/mesero', accesoMesero, seguimientoController.mostrarMesero);
router.post('/mesero/:id/entregar', accesoMesero, seguimientoController.entregarPedido);

module.exports = router;
