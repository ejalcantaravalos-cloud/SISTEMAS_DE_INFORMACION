const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: './src/env/.env' });
const cookieParser = require('cookie-parser');

// 1. Importar solo los routers que SÍ existen físicamente en tu carpeta Routes/
const router = require('./Routes/router');
const adminRoutes = require('./Routes/AdminRouters');
const menuRoutes = require('./Routes/MenuRouters'); 

const app = express();

// Configurar motor de plantillas EJS y vistas
app.set('views', path.join(__dirname, 'View'));
app.set('view engine', 'ejs');

// Carpeta pública para estilos
app.use(express.static(path.join(__dirname, 'Public')));

// Lectura de formularios
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(cookieParser());


app.use('/admin', adminRoutes);          
app.use('/admin/menu', menuRoutes);      
app.use('/', router);                    

// 4. Iniciar servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});