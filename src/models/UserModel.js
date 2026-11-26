
const conexion = require('../Database/db');
const db = conexion.promise();

// Errores controlados
const crearError = (mensaje, status = 400) => {
  const error = new Error(mensaje);
  error.status = status;
  return error;
};

// Dar formato a los roles de cada usuario
const formatearUsuario = (fila) => {
  const { roles_texto, ...usuario } = fila;

  const roles = roles_texto
    ? roles_texto.split('|')
    : [];

  return {
    ...usuario,
    roles,
    // Compatibilidad con vistas anteriores
    rol: roles.join(', ')
  };
};

// Ejecutar transacciones
const ejecutarTransaccion = async (operacion) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const resultado = await operacion(connection);

    await connection.commit();
    return resultado;

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
};

// Evitar que se elimine el último administrador
const protegerAdministrador = async (
  connection,
  usuarioId,
  mantendraAdmin
) => {
  // Bloquear el rol mientras se verifica
  await connection.query(`
    SELECT id FROM rol
    WHERE nombre = 'Administrador'
    FOR UPDATE
  `);

  const [[usuario]] = await connection.query(`
    SELECT
      u.activo,
      EXISTS (
        SELECT 1
        FROM usuario_rol ur
        INNER JOIN rol r ON r.id = ur.rol_id
        WHERE ur.usuario_id = u.id
          AND r.nombre = 'Administrador'
      ) AS es_admin
    FROM usuarios u
    WHERE u.id = ?
  `, [usuarioId]);

  if (!usuario) {
    throw crearError('El usuario no existe', 404);
  }

  if (
    Number(usuario.activo) !== 1 ||
    Number(usuario.es_admin) !== 1 ||
    mantendraAdmin
  ) {
    return;
  }

  const [[resultado]] = await connection.query(`
    SELECT COUNT(DISTINCT u.id) AS total
    FROM usuarios u
    INNER JOIN usuario_rol ur
      ON ur.usuario_id = u.id
    INNER JOIN rol r
      ON r.id = ur.rol_id
    WHERE r.nombre = 'Administrador'
      AND u.activo = 1
  `);

  if (resultado.total <= 1) {
    throw crearError(
      'No puedes quitar al último administrador activo',
      409
    );
  }
};

// Consultar usuarios con sus roles
const consultarUsuarios = async (
  condicion = '',
  parametros = []
) => {
  const [resultados] = await db.query(`
    SELECT
      u.id,
      u.nombre,
      u.email,
      u.activo,
      u.creado_en,
      GROUP_CONCAT(
        DISTINCT r.nombre
        ORDER BY r.nombre
        SEPARATOR '|'
      ) AS roles_texto
    FROM usuarios u
    LEFT JOIN usuario_rol ur
      ON ur.usuario_id = u.id
    LEFT JOIN rol r
      ON r.id = ur.rol_id
    ${condicion}
    GROUP BY
      u.id, u.nombre, u.email,
      u.activo, u.creado_en
    ORDER BY u.id
  `, parametros);

  return resultados.map(formatearUsuario);
};

const UserModel = {

  // 1. Obtener todos los usuarios
  getAll: async () => {
    return await consultarUsuarios();
  },

  // 2. Obtener usuario por ID
  getById: async (id) => {
    const usuarios = await consultarUsuarios(
      'WHERE u.id = ?',
      [id]
    );

    return usuarios[0] || null;
  },

  // 3. Obtener catálogo de roles
  getRoles: async () => {
    const [roles] = await db.query(`
      SELECT id, nombre, descripcion
      FROM rol
      ORDER BY id
    `);

    return roles;
  },

  // 4. Actualizar usuario y sus roles
  update: async (id, nombre, email, roles) => {

    if (
      typeof nombre !== 'string' ||
      typeof email !== 'string' ||
      !nombre.trim() ||
      !email.trim() ||
      !Array.isArray(roles) ||
      roles.length === 0
    ) {
      throw crearError(
        'Completa los datos y selecciona al menos un rol'
      );
    }

    const seleccionados = [...new Set(roles)];

    return await ejecutarTransaccion(async (connection) => {

      // Verificar que existan todos los roles
      const [rolesValidos] = await connection.query(`
        SELECT id, nombre
        FROM rol
        WHERE nombre IN (?)
      `, [seleccionados]);

      if (rolesValidos.length !== seleccionados.length) {
        throw crearError(
          'Se seleccionó un rol que no existe'
        );
      }

      // Proteger al último administrador
      await protegerAdministrador(
        connection,
        id,
        seleccionados.includes('Administrador')
      );

      // Actualizar datos personales
      await connection.query(`
        UPDATE usuarios
        SET nombre = ?, email = ?
        WHERE id = ?
      `, [
        nombre.trim(),
        email.trim().toLowerCase(),
        id
      ]);

      // Eliminar las asignaciones anteriores
      await connection.query(`
        DELETE FROM usuario_rol
        WHERE usuario_id = ?
      `, [id]);

      // Registrar las nuevas asignaciones
      for (const rol of rolesValidos) {
        await connection.query(`
          INSERT INTO usuario_rol
            (usuario_id, rol_id)
          VALUES (?, ?)
        `, [id, rol.id]);
      }
    });
  },

  // 5. Eliminar usuario
  delete: async (id) => {
    return await ejecutarTransaccion(async (connection) => {

      await protegerAdministrador(
        connection,
        id,
        false
      );

      await connection.query(`
        DELETE FROM usuarios
        WHERE id = ?
      `, [id]);
    });
  }
};

module.exports = UserModel;