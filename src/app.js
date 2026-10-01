const express = require('express')
const path = require('path')
const dotenv = require('dotenv')
dotenv.config({ path: './src/env/.env' })
const cookieParser = require('cookie-parser')
const router = require('./Routes/router')
const adminRoutes = require('./Routes/AdminRouters');
const app = express()


// 1. Configurar motor de plantillas EJS y carpeta de vistas
app.set('views', path.join(__dirname, 'view'))
app.set('view engine', 'ejs')

// Configuración de carpeta pública
app.use(express.static(path.join(__dirname, 'public')))

// Carga de formularios
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

app.use(cookieParser())

app.use('/admin', adminRoutes);
app.use('/', router)

app.listen(3000, () => {
  console.log('Servidor activo en puerto 3000')
})