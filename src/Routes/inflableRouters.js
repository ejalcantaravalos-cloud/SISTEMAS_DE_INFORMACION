const express = require('express');
const router = express.Router();
const InflableController = require('../Controllers/InflableController');


router.get('/inflables', InflableController.listar);
router.get('/inflables/catalogo', InflableController.obtenerCatalogoPublico);
router.post('/inflables/crear', InflableController.crear);
router.get('/inflables/eliminar/:id', InflableController.eliminar);

module.exports = router;