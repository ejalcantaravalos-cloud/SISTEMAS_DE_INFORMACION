const UserModel = require('../Models/UserModel');

const AdminController = {
  // Listar todos los usuarios en una vista de administración
  listUsers: (req, res) => {
    UserModel.getAll((error, results) => {
      if (error) {
        console.log("Error al obtener usuarios:", error);
        return res.status(500).send("Error interno del servidor");
      }
      // Renderiza una vista EJS 
      res.render('admin/users', { usuarios: results, user: req.user });
    });
  },

  // Formulario para editar un usuario
  editForm: (req, res) => {
    const userId = req.params.id;
    UserModel.getById(userId, (error, results) => {
      if (error || results.length === 0) {
        return res.redirect('/admin/users');
      }
      res.render('admin/editUser', { usuario: results[0], user: req.user });
    });
  },

  // Procesar la actualización
  updateUser: (req, res) => {
    const userId = req.params.id;
    const { nombre, email, rol } = req.body;
    
    UserModel.update(userId, nombre, email, rol, (error) => {
      if (error) {
        console.log("Error al actualizar:", error);
      }
      res.redirect('/admin/users');
    });
  },

  // Eliminar usuario
  deleteUser: (req, res) => {
    const userId = req.params.id;
    UserModel.delete(userId, (error) => {
      if (error) {
        console.log("Error al eliminar:", error);
      }
      res.redirect('/admin/users');
    });
  }
};

module.exports = AdminController;