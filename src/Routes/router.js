const express = require('express');
const router = express.Router();
const authController = require('../Controllers/AuthController');

// 1. RUTA PÚBLICA 
router.get('/', (req, res) => {
  res.render('index'); 
});

// 2. RUTAS DE FORMULARIOS 
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// 3. RUTA PRIVADA PARA CLIENTES 
router.get('/cliente', authController.isAuthenticated, (req, res) => {
  res.render('VistaCliente', { user: req.user });
});

// Procesamiento de datos
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

module.exports = router;