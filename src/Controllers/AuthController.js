const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const conexion = require('../Database/db')
const { promisify } = require('util')

//  defecto se crea como 'Aspirante'
exports.register = async (req, res) => {
  try {
    const { nombre, email, password } = req.body

    if (!nombre || !email || !password) {
      return res.render('register', { error: 'Por favor completa todos los campos' })
    }

    const passwordHash = await bcrypt.hash(password, 8)

    conexion.query(
      'INSERT INTO usuarios SET ?',
      { nombre: nombre, email: email, password: passwordHash, rol: 'Aspirante' },
      (error, results) => {
        if (error) {
          console.log("Error al registrar:", error)
          if (error.code === 'ER_DUP_ENTRY') {
            return res.render('register', { error: 'El correo ya está registrado' })
          }
          return res.render('register', { error: 'Error en la base de datos: ' + error.message })
        }
        res.redirect('/login')
      }
    )
  } catch (error) {
    console.log(error)
    res.render('register', { error: 'Error interno del servidor' })
  }
}

// Iniciar sesión redirección por rol)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.render('login', { error: 'Por favor ingresa email y contraseña' })
    }

    conexion.query('SELECT * FROM usuarios WHERE email = ?', [email], async (error, results) => {
      if (error) {
        console.log("Error de BD en login:", error)
        return res.render('login', { error: 'Error conectando a la base de datos, intenta de nuevo.' })
      }

      if (results.length === 0 || !(await bcrypt.compare(password, results[0].password))) {
        return res.render('login', { error: 'Email o contraseña incorrectos' })
      }

      const user = results[0]

      // Generar Token JWT
      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN
      })

      const cookieOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        httpOnly: true
      }

      res.cookie('jwt', token, cookieOptions)

      // Redirección estricta según el rol actual en la Base de Datos
      if (user.rol === 'admin') {
        return res.redirect('/admin');
      } else if (user.rol === 'Cocinero') {
        return res.redirect('/Cocinero');
      } else if (user.rol === 'Limpieza') {
        return res.redirect('/Limpieza');
      } else if (user.rol === 'Mesero') {
        return res.redirect('/Mesero');
      } else if (user.rol === 'Cajero') {
        return res.redirect('/Cajero');
      } else {
        // Si es 'Aspirante' o cualquier otro, va directo a la vista de cliente (VistaAspirante.ejs)
        return res.redirect('/Aspirante');
      }
    })
  } catch (error) {
    console.log(error)
    return res.render('login', { error: 'Error interno del servidor' })
  }
}

//  Middleware básico de autenticación
exports.isAuthenticated = async (req, res, next) => {
  if (!req.cookies || !req.cookies.jwt) {
    return res.redirect('/login');
  }

  try {
    const decodificada = await promisify(jwt.verify)(req.cookies.jwt, process.env.JWT_SECRET);

    conexion.query('SELECT * FROM usuarios WHERE id = ?', [decodificada.id], (error, results) => {
      if (error || !results || results.length === 0) {
        return res.redirect('/login');
      }
      req.user = results[0];
      return next();
    });
  } catch (error) {
    return res.redirect('/login');
  }
}

// Middleware de seguridad por rol (Evita que un aspirante o mesero entre a vistas prohibidas)
exports.hasRole = (rolePermitido) => {
  return async (req, res, next) => {
    if (!req.cookies || !req.cookies.jwt) {
      return res.redirect('/login');
    }

    try {
      const decodificada = await promisify(jwt.verify)(req.cookies.jwt, process.env.JWT_SECRET);

      conexion.query('SELECT * FROM usuarios WHERE id = ?', [decodificada.id], (error, results) => {
        if (error || !results || results.length === 0) {
          return res.redirect('/login');
        }

        const user = results[0];

        // Si el usuario no tiene el rol exacto permitido para esta ruta, lo rebotamos a su vista correspondiente
        if (user.rol !== rolePermitido) {
          console.log(`--> Acceso bloqueado: Usuario ${user.email} con rol '${user.rol}' intentó entrar a una zona de '${rolePermitido}'.`);
          
          if (user.rol === 'admin') return res.redirect('/admin');
          if (user.rol === 'Cocinero') return res.redirect('/Cocinero');
          if (user.rol === 'Limpieza') return res.redirect('/Limpieza');
          if (user.rol === 'Mesero') return res.redirect('/Mesero');
          return res.redirect('/cliente'); // Por defecto para Aspirantes
        }

        req.user = user;
        return next();
      });
    } catch (error) {
      return res.redirect('/login');
    }
  };
}

// 5. Cerrar sesión
exports.logout = (req, res) => {
  res.clearCookie('jwt')
  return res.redirect('/')
}