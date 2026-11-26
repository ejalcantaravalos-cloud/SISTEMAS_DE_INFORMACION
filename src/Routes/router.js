
const express = require('express');
const router = express.Router();

const authController = require('../Controllers/AuthController');
const PlatilloController = require('../Controllers/PlatilloController');
const ordenController = require('../Controllers/OrdenController');


// Página principal
router.get('/', (req, res) => {
  res.render('index');
});

// Menú público del restaurante
router.get('/menu', PlatilloController.catalogoPublico);

// Formulario de inicio de sesión
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Formulario de registro
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// Procesamiento de formularios
router.post('/register', authController.register);
router.post('/login', authController.login);

// Cerrar sesión
router.get('/logout', authController.logout);


// COCINA

router.get(
  '/Cocinero',
  authController.hasRole(['Cocina', 'Administrador']),
  (req, res) => res.redirect('/ordenes/cocina')
);

//Mesero
router.get(
  '/Mesero',
  authController.hasRole(['Mesero', 'Administrador']),
  (req, res) => res.redirect('/ordenes/mesero')
);


// CAJERO DEL RESTAURANTE
router.get(
  '/Cajero',
  authController.hasRole(['Cajero restaurante', 'Cajero rentas', 'Administrador']),
  ordenController.mostrarCaja
);


// LIMPIEZA
router.get(
  '/Limpieza',
  authController.hasRole('Limpieza'),
  (req, res) => {
    res.render('VistaLimpieza', {
      user: req.user
    });
  }
);


// ASPIRANTE
router.get(
  '/Aspirante',
  authController.hasRole('Aspirante'),
  (req, res) => {
    res.render('VistaAspirante', {
      user: req.user
    });
  }
);


module.exports = router;
