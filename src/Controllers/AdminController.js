
const UserModel = require('../models/UserModel');

const AdminController = {

  // 1. Listar todos los usuarios
  listUsers: async (req, res) => {
    try {
      const usuarios = await UserModel.getAll();

      return res.render('AdminVista', {
  usuarios,
  user: req.user
});

    } catch (error) {
      console.error('Error al obtener usuarios:', error);

      return res.status(500).send(
        'Error al consultar los usuarios'
      );
    }
  },


  // 2. Formulario para editar un usuario
  editForm: async (req, res) => {
    try {
      const userId = req.params.id;

      const [usuario, rolesDisponibles] =
        await Promise.all([
          UserModel.getById(userId),
          UserModel.getRoles()
        ]);

      if (!usuario) {
        return res.redirect('/admin/users');
      }

      return res.render('editUser', {
  usuario,
  rolesDisponibles,
  user: req.user,
  error: null
});

    } catch (error) {
      console.error('Error al cargar formulario:', error);

      return res.status(500).send(
        'Error al consultar la información del usuario'
      );
    }
  },


  // 3. Actualizar usuario y roles
  updateUser: async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { nombre, email } = req.body;


      const seleccion = req.body.roles ?? req.body.rol;

      const roles = (
        Array.isArray(seleccion)
          ? seleccion
          : [seleccion]
      )
        .filter(valor => typeof valor === 'string')
        .map(valor => valor.trim())
        .filter(Boolean);

      // Evitar quitarse su propio acceso
      if (
        userId === Number(req.user.id) &&
        !roles.includes('Administrador')
      ) {
        return res.status(403).send(
          'No puedes quitarte tu propio rol de administrador'
        );
      }

      await UserModel.update(
        userId,
        nombre,
        email,
        roles
      );

      return res.redirect('/admin/users');

    } catch (error) {
      console.error('Error al actualizar:', error);

      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).send(
          'El correo ya está registrado'
        );
      }

      return res.status(error.status || 500).send(
        error.status
          ? error.message
          : 'Error al actualizar el usuario'
      );
    }
  },


  // 4. Eliminar usuario
  deleteUser: async (req, res) => {
    try {
      const userId = Number(req.params.id);

      // No permitir eliminar la propia cuenta
      if (userId === Number(req.user.id)) {
        return res.status(403).send(
          'No puedes eliminar tu propia cuenta'
        );
      }

      await UserModel.delete(userId);

      return res.redirect('/admin/users');

    } catch (error) {
      console.error('Error al eliminar usuario:', error);

      return res.status(error.status || 500).send(
        error.status
          ? error.message
          : 'Error al eliminar el usuario'
      );
    }
  }
};

module.exports = AdminController;
