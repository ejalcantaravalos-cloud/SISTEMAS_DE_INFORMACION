const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const conexion = require('../Database/db')
const { promisify } = require('util')

// 1. Registrar usuario
exports.register = async (req, res) => {
  try {
    const { nombre, email, password } = req.body

    if (!nombre || !email || !password) {
      return res.render('register', { error: 'Por favor completa todos los campos' })
    }

    const passwordHash = await bcrypt.hash(password, 8)

    conexion.query(
      'INSERT INTO usuarios SET ?',
      { nombre: nombre, email: email, password: passwordHash },
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

// 2. Iniciar sesión (Login con Cookie JWT)
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

      // Opciones de la Cookie
      const cookieOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        httpOnly: true
      }

      // Guardar Cookie
      res.cookie('jwt', token, cookieOptions)

      // Redirección según el rol
      if (user.rol === 'admin') {
        return res.redirect('/admin');
      }

      return res.redirect('/cliente');
    })
  } catch (error) {
    console.log(error)
    return res.render('login', { error: 'Error interno del servidor' })
  }
}

// 3. Middleware: usuario autenticado (con logs de depuración)
exports.isAuthenticated = async (req, res, next) => {
  if (!req.cookies || !req.cookies.jwt) {
    console.log("--> Expulsado: No se encontró la cookie 'jwt' en la petición.");
    return res.redirect('/login');
  }

  try {
    const decodificada = await promisify(jwt.verify)(req.cookies.jwt, process.env.JWT_SECRET);

    conexion.query('SELECT * FROM usuarios WHERE id = ?', [decodificada.id], (error, results) => {
      if (error || !results || results.length === 0) {
        console.log("--> Expulsado: Usuario del token no existe en la BD.");
        return res.redirect('/login');
      }
      req.user = results[0];
      return next();
    });
  } catch (error) {
    console.log("--> Expulsado por error en JWT:", error.message);
    return res.redirect('/login');
  }
}

// 4. Middleware: SOLO admin (con logs de depuración)
exports.isAdmin = async (req, res, next) => {
  if (!req.cookies || !req.cookies.jwt) {
    console.log("--> Expulsado (isAdmin): No hay cookie 'jwt'.");
    return res.redirect('/login');
  }

  try {
    const decodificada = await promisify(jwt.verify)(req.cookies.jwt, process.env.JWT_SECRET);

    conexion.query('SELECT * FROM usuarios WHERE id = ?', [decodificada.id], (error, results) => {
      if (error || !results || results.length === 0) {
        console.log("--> Expulsado (isAdmin): No se encontró el usuario.");
        return res.redirect('/login');
      }

      const user = results[0];

      if (user.rol !== 'admin') {
        console.log(`--> Expulsado: El usuario ${user.email} tiene rol '${user.rol}', no 'admin'.`);
        return res.redirect('/');
      }

      req.user = user;
      return next();
    });
  } catch (error) {
    console.log("--> Expulsado (isAdmin) por error en JWT:", error.message);
    return res.redirect('/login');
  }
}

// 5. Cerrar sesión (Eliminar Cookie)
exports.logout = (req, res) => {
  res.clearCookie('jwt')
  return res.redirect('/')
}

// 6. Middleware suave (Detecta si hay sesión sin bloquear)
exports.checkUser = async (req, res, next) => {
  if (!req.cookies || !req.cookies.jwt) {
    req.user = null;
    return next();
  }

  try {
    const decodificada = await promisify(jwt.verify)(req.cookies.jwt, process.env.JWT_SECRET);
    
    conexion.query('SELECT * FROM usuarios WHERE id = ?', [decodificada.id], (error, results) => {
      if (error || !results || results.length === 0) {
        req.user = null;
      } else {
        req.user = results[0];
      }
      return next();
    });
  } catch (error) {
    req.user = null;
    return next();
  }
};