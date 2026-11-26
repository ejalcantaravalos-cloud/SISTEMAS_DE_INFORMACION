
const express = require('express');
const router = express.Router();

const authController = require('../Controllers/AuthController');
const AdminController = require('../Controllers/AdminController');
const ingredienteRouter = require('./IngredienteRouter');
const platilloRouter = require('./PlatilloRouter');
const menuAdminRouter = require('./MenuAdminRouter');


// Solo usuarios con el rol Administrador
router.use(
  authController.hasRole('Administrador')
);

// Todas las rutas de ingredientes
router.use('/ingredientes', ingredienteRouter);
// CRUD de platillos
router.use('/menu/productos', platilloRouter);
router.use('/menu/menus', menuAdminRouter);


// GET /admin
router.get(
  '/',
  AdminController.listUsers
);

// GET /admin/users
router.get(
  '/users',
  AdminController.listUsers
);

// Formulario para crear usuario
router.get('/users/new', (req, res) => {
  res.render('register', {
    error: null
  });
});

// Formulario para editar usuario
router.get(
  '/users/edit/:id',
  AdminController.editForm
);

// Guardar cambios del usuario
router.post(
  '/users/update/:id',
  AdminController.updateUser
);

// Eliminar usuario
router.post(
  '/users/delete/:id',
  AdminController.deleteUser
);


module.exports = router;
