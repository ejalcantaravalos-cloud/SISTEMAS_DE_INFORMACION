'use strict';
const express = require('express');
const router = express.Router();
const ordenController = require('../Controllers/OrdenController');
const authController = require('../Controllers/AuthController');

// En tu base de datos el nombre es "Cajero restaurante", NO "Cajero".
// Administrador también puede entrar para hacer pruebas.
const caja = authController.hasRole(['Cajero restaurante', 'Cajero rentas', 'Administrador']);

router.get('/caja', caja, ordenController.mostrarCaja);
router.get('/pedidos', caja, ordenController.listarPedidos);
router.get('/pedidos/pendientes-pago', caja, ordenController.listarPendientesPago);
router.post('/api/ordenes/crear', caja, ordenController.crearOrden);
router.get('/pedidos/:id/editar', caja, ordenController.mostrarEdicion);
router.post('/pedidos/:id/editar', caja, ordenController.modificarOrden);
router.get('/cobro/:id', caja, ordenController.mostrarCobro);

// Abrir turno y registrar un pago real (no cambia un campo ficticio en pedido).
router.post('/turno/abrir', caja, ordenController.abrirTurno);
router.post('/cobro/:id/pagar', caja, ordenController.registrarPago);

// Para la siguiente etapa (cocina y meseros):
router.post('/estado/:id',
    authController.hasRole(['Cocina', 'Mesero', 'Administrador']),
    ordenController.actualizarEstado
);

module.exports = router;
