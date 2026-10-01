const express = require('express');
const router = express.Router();
const conexion = require('../Database/db');
const authController = require('../Controllers/AuthController');

// Aplicar protección global a todas las rutas de este archivo
router.use(authController.isAuthenticated, authController.isAdmin);

//VISTA PRINCIPAL DEL PANEL 
// Ruta real: GET /admin/
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
// Ruta real: GET /admin/users/new
router.get('/users/new', (req, res) => {
  res.render('register', { error: null });
});

// ACCIÓN DE ELIMINAR USUARIO
// Ruta real: GET /admin/users/delete/:id
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
// Ruta real: GET /admin/users/edit/:id
router.get('/users/edit/:id', (req, res) => {
  const id = req.params.id;
  conexion.query('SELECT * FROM usuarios WHERE id = ?', [id], (error, results) => {
    if (error || results.length === 0) {
      return res.redirect('/admin');
    }
    // Renderiza editUser.ejs pasando los datos del usuario a editar
    res.render('editUser', { usuario: results[0], user: req.user });
  });
});

// ACCIÓN DE GUARDAR CAMBIOS DE EDICIÓN
// Ruta real: POST /admin/users/update/:id
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