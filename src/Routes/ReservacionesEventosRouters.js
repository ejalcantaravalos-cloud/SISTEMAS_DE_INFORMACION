const router = require('express').Router();
const Controller = require('../Controllers/ReservacionesEventosController');
router.get('/', Controller.listar);
router.get('/historial', Controller.historial);
router.get('/disponibilidad', Controller.disponibilidad);
router.post('/cotizar', Controller.cotizar);
router.post('/crear', Controller.crear);
module.exports = router;
