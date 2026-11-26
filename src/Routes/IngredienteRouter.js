const express = require('express');
const router = express.Router();
const IngredienteController = require('../Controllers/IngredienteController');
const authController = require('../Controllers/AuthController');

// Protección propia: incluso si se monta fuera del AdminRouter.
router.use(authController.hasRole('Administrador'));

router.get('/', IngredienteController.index);
router.post('/', IngredienteController.crear);
router.post('/:id/editar', IngredienteController.actualizar);
router.post('/:id/entrada', IngredienteController.registrarEntrada);
router.post('/:id/estado', IngredienteController.cambiarEstado);

module.exports = router;
