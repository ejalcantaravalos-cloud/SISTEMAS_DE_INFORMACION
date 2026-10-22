const express = require('express');
const router = express.Router();
const conexion = require('../Database/db');
const authController = require('../Controllers/AuthController');

// Aplicar protección global para que solo los administradores entren aquí
router.use(authController.hasRole('admin'));

// VISTA PRINCIPAL DEL PANEL 
router.get('/', (req, res) => {
  conexion.query('SELECT * FROM usuarios', (error, results) => {
    if (error) {
      console.log("Error al consultar usuarios:", error);
      return res.status(500).send("Error interno del servidor");
    }
    res.render('AdminVista', { user: req.user, usuarios: results });
  });
});

// FORMULARIO PARA CREAR UN NUEVO USUARIO
router.get('/users/new', (req, res) => {
  res.render('register', { error: null });
});

// ACCIÓN DE ELIMINAR USUARIO
router.get('/users/delete/:id', (req, res) => {
  const id = req.params.id;
  conexion.query('DELETE FROM usuarios WHERE id = ?', [id], (error) => {
    if (error) {
      console.log("Error al eliminar usuario:", error);
    }
    res.redirect('/admin');
  });
});

// VISTA PARA EDITAR USUARIO
router.get('/users/edit/:id', (req, res) => {
  const id = req.params.id;
  conexion.query('SELECT * FROM usuarios WHERE id = ?', [id], (error, results) => {
    if (error || results.length === 0) {
      return res.redirect('/admin');
    }
    res.render('editUser', { usuario: results[0], user: req.user });
  });
});

// ACCIÓN DE GUARDAR CAMBIOS DE EDICIÓN
router.post('/users/update/:id', (req, res) => {
  const id = req.params.id;
  const { nombre, email, rol } = req.body;
  
  conexion.query(
    'UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?',
    [nombre, email, rol, id],
    (error) => {
      if (error) {
        console.log("Error al actualizar usuario:", error);
      }
      res.redirect('/admin');
    }
  );
});

module.exports = router;