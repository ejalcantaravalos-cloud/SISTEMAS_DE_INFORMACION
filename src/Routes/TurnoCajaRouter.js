'use strict';

const express = require('express');
const authController = require('../Controllers/AuthController');
const TurnoCajaController = require('../Controllers/TurnoCajaController');

const router = express.Router();

// Protegemos todo el módulo con el middleware ya existente.
router.use(authController.hasRole(['Administrador', 'Cajero rentas', 'Cajero restaurante']));

router.get('/', TurnoCajaController.menu);
router.post('/turnos/abrir', TurnoCajaController.abrir);
router.post('/turnos/cerrar', TurnoCajaController.cerrar);
router.post('/reservaciones/:id/finalizar', TurnoCajaController.finalizar);
router.post('/reservaciones/:id/liquidar', TurnoCajaController.liquidar);

module.exports = router;
