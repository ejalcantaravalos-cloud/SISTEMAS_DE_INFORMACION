'use strict';
const express = require('express');
const router = express.Router();
const authController = require('../Controllers/AuthController');
const MenuAdminController = require('../Controllers/MenuAdminController');

// Este router se monta bajo /admin/menu/menus.
router.use(authController.hasRole('Administrador'));
router.get('/', MenuAdminController.listar);
router.post('/crear', MenuAdminController.crear);
router.post('/editar/:id', MenuAdminController.editar);
router.post('/estado/:id', MenuAdminController.cambiarEstado);

module.exports = router;
