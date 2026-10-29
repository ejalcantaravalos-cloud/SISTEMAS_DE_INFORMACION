const express = require('express');
const router = express.Router();
const ordenController = require('../Controllers/OrdenController');
const authController = require('../Controllers/AuthController');

// Vista del cajero para tomar la orden
router.get('/caja', authController.hasRole('Cajero'), ordenController.mostrarCaja);
router.get('/pedidos', authController.hasRole('Cajero'), ordenController.listarPedidos);

// Endpoint para guardar la comanda realizada
router.post('/api/ordenes/crear', authController.hasRole('Cajero'), ordenController.crearOrden);


module.exports = router;