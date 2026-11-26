const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const conexion = require('../Database/db');

// Convertir consultas de MySQL a promesas
const consultar = (db, sql, parametros = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, parametros, (error, resultado) => {
      if (error) return reject(error);
      resolve(resultado);
    });
  });
};

// Ejecutar operaciones de forma segura en una transacción
const transaccion = async (operacion) => {
  const esPool = typeof conexion.getConnection === 'function';

  const db = esPool
    ? await new Promise((resolve, reject) => {
        conexion.getConnection((error, connection) => {
          if (error) return reject(error);
          resolve(connection);
        });
      })
    : conexion;

  let iniciada = false;

  try {
    await new Promise((resolve, reject) => {
      db.beginTransaction(error => {
        if (error) return reject(error);
        resolve();
      });
    });

    iniciada = true;

    const resultado = await operacion(db);

    await new Promise((resolve, reject) => {
      db.commit(error => {
        if (error) return reject(error);
        resolve();
      });
    });

    iniciada = false;
    return resultado;

  } catch (error) {
    if (iniciada) {
      await new Promise(resolve => {
        db.rollback(() => resolve());
      });
    }
    throw error;

  } finally {
    if (esPool) db.release();
  }
};

// Obtener un usuario con todos sus roles
const obtenerUsuario = async (campo, valor) => {
  const condicion = campo === 'email'
    ? 'u.email = ?'
    : 'u.id = ?';

  const filas = await consultar(conexion, `
    SELECT
      u.id,
      u.nombre,
      u.email,
      u.password,
      u.activo,
      r.nombre AS nombre_rol
    FROM usuarios u
    LEFT JOIN usuario_rol ur
      ON ur.usuario_id = u.id
    LEFT JOIN rol r
      ON r.id = ur.rol_id
    WHERE ${condicion}
  `, [valor]);

  if (filas.length === 0) return null;

  return {
    id: filas[0].id,
    nombre: filas[0].nombre,
    email: filas[0].email,
    password: filas[0].password,
    activo: filas[0].activo,
    roles: [...new Set(
      filas.map(fila => fila.nombre_rol).filter(Boolean)
    )]
  };
};

// Comprobar la sesión JWT
const obtenerUsuarioAutenticado = async (req) => {
  const token = req.cookies?.jwt;

  if (!token) return null;

  let datos;

  try {
    datos = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (
      error.name === 'TokenExpiredError' ||
      error.name === 'JsonWebTokenError' ||
      error.name === 'NotBeforeError'
    ) {
      return null;
    }
    throw error;
  }

  const usuario = await obtenerUsuario('id', datos.id);

  if (!usuario || Number(usuario.activo) !== 1) {
    return null;
  }

  // Nunca agregar la contraseña a req.user
  const { password, ...usuarioSeguro } = usuario;
  return usuarioSeguro;
};


// 1. REGISTRAR USUARIO
exports.register = async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    if (
      typeof nombre !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !nombre.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.render('register', {
        error: 'Por favor completa todos los campos'
      });
    }

    if (password.length < 8) {
      return res.render('register', {
        error: 'La contraseña debe tener al menos 8 caracteres'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await transaccion(async (db) => {

      // Buscar el rol predeterminado
      const roles = await consultar(db,
        'SELECT id FROM rol WHERE nombre = ?',
        ['Aspirante']
      );

      if (roles.length === 0) {
        throw new Error('No existe el rol Aspirante');
      }

      // Crear el usuario
      const resultado = await consultar(db, `
        INSERT INTO usuarios (nombre, email, password)
        VALUES (?, ?, ?)
      `, [
        nombre.trim(),
        email.trim().toLowerCase(),
        passwordHash
      ]);

      // Asignarle el rol Aspirante
      await consultar(db, `
        INSERT INTO usuario_rol (usuario_id, rol_id)
        VALUES (?, ?)
      `, [
        resultado.insertId,
        roles[0].id
      ]);
    });

    return res.redirect('/login');

  } catch (error) {
    console.error('Error al registrar:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.render('register', {
        error: 'El correo ya está registrado'
      });
    }

    return res.render('register', {
      error: 'No fue posible registrar el usuario'
    });
  }
};


// 2. INICIAR SESIÓN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.render('login', {
        error: 'Por favor ingresa email y contraseña'
      });
    }

    const usuario = await obtenerUsuario(
      'email',
      email.trim()
    );

    if (
      !usuario ||
      !(await bcrypt.compare(password, usuario.password))
    ) {
      return res.render('login', {
        error: 'Email o contraseña incorrectos'
      });
    }

    if (Number(usuario.activo) !== 1) {
      return res.render('login', {
        error: 'Tu cuenta se encuentra deshabilitada'
      });
    }

    if (usuario.roles.length === 0) {
      return res.render('login', {
        error: 'Tu cuenta no tiene un rol asignado'
      });
    }

    // Generar JWT
    const token = jwt.sign(
      { id: usuario.id },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }
    );

    res.cookie('jwt', token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    // Prioridad de redirección cuando tiene varios roles

// Prioridad de redirección cuando tiene varios roles
const destinos = [
    ['Administrador', '/admin'],
    ['Cajero rentas', '/rentas'],
    ['Cajero restaurante', '/Cajero'],
    ['Cocina', '/Cocinero'],
    ['Mesero', '/Mesero'],
    ['Limpieza', '/Limpieza'],
    ['Aspirante', '/Aspirante']
];


    for (const [rol, ruta] of destinos) {
      if (usuario.roles.includes(rol)) {
        return res.redirect(ruta);
      }
    }

    // Falta configurar la ruta de Cajero rentas
    return res.status(403).send(
      'Tu rol todavía no tiene una vista configurada'
    );

  } catch (error) {
    console.error('Error al iniciar sesión:', error);

    return res.render('login', {
      error: 'Error interno del servidor'
    });
  }
};


// 3. VERIFICAR AUTENTICACIÓN
exports.isAuthenticated = async (req, res, next) => {
  try {
    const usuario = await obtenerUsuarioAutenticado(req);

    if (!usuario) {
      return res.redirect('/login');
    }

    req.user = usuario;
    return next();

  } catch (error) {
    console.error('Error de autenticación:', error);
    return next(error);
  }
};


// 4. VERIFICAR PERMISOS SEGÚN ROL

exports.hasRole = (rolesPermitidos) => {
    return async (req, res, next) => {
        try {
            const usuario = req.user ||
                await obtenerUsuarioAutenticado(req);

            // Verificar que haya sesión
            if (!usuario) {
                return res.redirect('/login');
            }

            // Convertir los roles permitidos en un arreglo
            const roles = Array.isArray(rolesPermitidos)
                ? rolesPermitidos
                : [rolesPermitidos];

            // Comprobar que el usuario tenga roles válidos
            const rolesUsuario = Array.isArray(usuario.roles)
                ? usuario.roles
                : [];

            // Comprobar permisos
            const tienePermiso = rolesUsuario.some(
                rol => roles.includes(rol)
            );

    if (!tienePermiso) {

    console.log('ACCESO DENEGADO:', {
        ruta: req.originalUrl,
        rolesUsuario: usuario.roles,
        rolesPermitidos: roles
    });

    return res.status(403).send(
        'Acceso denegado: no tienes permisos para esta sección.'
    );
}

            // Hacer disponible el usuario para el controlador
            req.user = usuario;

            return next();

        } catch (error) {
            console.error('Error verificando roles:', error);
            return next(error);
        }
    };
};



// 5. CERRAR SESIÓN
exports.logout = (req, res) => {
  res.clearCookie('jwt', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });

  return res.redirect('/');
};
