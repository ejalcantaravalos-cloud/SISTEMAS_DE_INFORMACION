const router = require('express').Router();
const Controller = require('../Controllers/GestionRentasController');

// Montar en /rentas/gestion con hasRole('Cajero rentas').
router.get('/inflables', Controller.menuInflables);
router.get('/eventos/calendario', Controller.calendarioEventos);
router.get('/eventos/calendario/datos', Controller.datosCalendario);
module.exports = router;
