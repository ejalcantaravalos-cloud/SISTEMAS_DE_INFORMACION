const conexion = require('../Database/db');

const UserModel = {
  // Obtener todos los usuarios
  getAll: (callback) => {
    const query = 'SELECT id, nombre, email, rol, creado_en FROM usuarios';
    conexion.query(query, callback);
  },

  // Obtener un usuario por ID
  getById: (id, callback) => {
    const query = 'SELECT id, nombre, email, rol, creado_en FROM usuarios WHERE id = ?';
    conexion.query(query, [id], callback);
  },

  // Actualizar un usuario 
  update: (id, nombre, email, rol, callback) => {
    const query = 'UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?';
    conexion.query(query, [nombre, email, rol, id], callback);
  },

  // Eliminar un usuario
  delete: (id, callback) => {
    const query = 'DELETE FROM usuarios WHERE id = ?';
    conexion.query(query, [id], callback);
  }
};

module.exports = UserModel;