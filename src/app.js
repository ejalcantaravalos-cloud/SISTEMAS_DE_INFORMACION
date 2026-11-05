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
const imagenRoutes = require('./Routes/imagenRouters');
const InflableController = require('./Controllers/InflableController');
const ProductController = require('./Controllers/ProductController');
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
app.use('/api/imagenes', imagenRoutes);
app.get('/panel-imagenes', (req, res) => {
    res.render('Imagenes');
});
// Página principal pública
app.get('/', (req, res) => {
    res.render('VistaPublico', {
        user: req.user
    });
});

app.get('/inflables', InflableController.obtenerCatalogoPublico);
app.get('/restaurante', ProductController.catalogoPublico);

app.use('/', router);                    


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});