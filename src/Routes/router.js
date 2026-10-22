const express = require('express');
const router = express.Router();
const authController = require('../Controllers/AuthController');
const menuController = require('../Controllers/MenuController');


//  RUTA PÚBLICA 
router.get('/', (req, res) => {
  res.render('index'); 
});
// Ruta pública para el catálogo del restaurante
router.get('/menu', menuController.verMenuPublico);

//  RUTAS DE FORMULARIOS 
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

//  RUTAS PROTEGIDAS POR ROL (Con seguridad estricta)
router.get('/Cocinero', authController.hasRole('Cocinero'), (req, res) => {
  res.render('VistaCocinero', { user: req.user });
});

router.get('/Cajero', authController.hasRole('Cajero'), (req, res) => {
  res.render('VistaCajero', { user: req.user });
});

router.get('/Limpieza', authController.hasRole('Limpieza'), (req, res) => {
  res.render('VistaLimpieza', { user: req.user });
});

router.get('/Mesero', authController.hasRole('Mesero'), (req, res) => {
  res.render('VistaMesero', { user: req.user });
});

// La ruta aspirante (aquí caen los recién registrados que son 'Aspirante')
router.get('/Aspirante', authController.isAuthenticated, (req, res) => {
  res.render('VistaAspirante', { user: req.user });
});

// Procesamiento de datos de formularios
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

module.exports = router;