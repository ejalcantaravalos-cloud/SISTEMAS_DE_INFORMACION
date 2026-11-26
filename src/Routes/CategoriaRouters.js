const express = require('express');
const router = express.Router();

const categoriaController = require('../Controllers/CategoriaController');
const authController = require('../Controllers/AuthController');

router.use(
  authController.hasRole('Administrador')
);

router.get(
  '/categorias',
  categoriaController.listarCategorias
);

router.post(
  '/categorias/crear',
  categoriaController.crearCategoria
);

router.post(
  '/categorias/eliminar/:id',
  categoriaController.eliminarCategoria
);

module.exports = router;