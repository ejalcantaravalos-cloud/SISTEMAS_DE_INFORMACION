const express = require('express');
const Controller = require('../Controllers/CancelacionesController');

// Crear un router independiente para cada área.
// Cada montaje en app.js debe tener su propio middleware de autorización.
module.exports = function crearRouter(area) {
    if (!['eventos', 'inflables', 'restaurante'].includes(area)) {
        throw new Error('Área de cancelaciones inválida.');
    }

    const router = express.Router();

    router.get('/', (req, res) => Controller.listar(area, req, res));

    router.post('/cancelar/:id', (req, res) => Controller.cancelar(area, req, res));

    if (area !== 'restaurante') {
        router.post('/reagendaciones/:id/anticipo', (req, res) => Controller.cobrarAnticipo(area, req, res));
    }

    return router;
};
