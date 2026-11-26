'use strict';

const express = require('express');

const authController = require(
    '../Controllers/AuthController'
);

const LimpiezaInflablesController = require(
    '../Controllers/LimpiezaInflablesController'
);

const router = express.Router();

router.use(
    authController.hasRole([
        'Limpieza',
        'Administrador'
    ])
);

router.get(
    '/',
    LimpiezaInflablesController.inicio
);

router.post(
    '/:id/revision',
    LimpiezaInflablesController.registrarRevision
);

module.exports = router;
