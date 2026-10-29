const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: './src/env/.env' });
const cookieParser = require('cookie-parser');

const router = require('./Routes/router');
const adminRoutes = require('./Routes/AdminRouters');
const menuRoutes = require('./Routes/MenuRouters'); 
const ordenRoutes = require('./Routes/OrdenRouter');
const inflableRoutes = require('./Routes/inflableRouters'); 

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
app.use('/ordenes', ordenRoutes); 
app.use('/admin', inflableRoutes);
app.use('/', router);                    


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});