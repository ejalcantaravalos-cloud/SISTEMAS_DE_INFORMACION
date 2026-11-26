const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');


dotenv.config({
    path: path.join(__dirname, 'env', '.env')
});


// Rutas generales
const router = require('./Routes/router');

// Administración
const adminRoutes = require('./Routes/AdminRouters');
const categoriaRoutes = require('./Routes/CategoriaRouters');

// Restaurante
const ordenRoutes = require('./Routes/OrdenRouter');
const seguimientoRoutes = require('./Routes/SeguimientoRouter');

// Inflables - Administración
const inflableRoutes = require('./Routes/inflableRouters');

// Inflables - Caja de rentas
const RentaInflablesRouter = require('./Routes/RentaInflablesRouter');

//inflables- limpieza
const LimpiezaInflablesRouter = require('./Routes/LimpiezaInflablesRouter');

//Salones
const SalonesRouters = require('./Routes/SalonesRouters');
const SalonesController = require('./Controllers/SalonesController');
const PaquetesRouters = require('./Routes/PaquetesRouters');
const ReservacionesEventosRouters = require('./Routes/ReservacionesEventosRouters');
const GestionRentasRouters = require('./Routes/GestionRentasRouters');
// Imágenes
const imagenRoutes = require('./Routes/imagenRouters');

const authController = require('./Controllers/AuthController');
const InflableController = require('./Controllers/InflableController');
const TurnoCajaRouter = require('./Routes/TurnoCajaRouter');
const SonidoRouters = require('./Routes/SonidoRouters');
const MantelesRouters = require('./Routes/MantelesRouters');
const crearCancelacionesRouter = require('./Routes/CancelacionesRouters');





const app = express();



app.use(express.urlencoded({
    extended: true
}));

app.use(express.json());

app.use(cookieParser());



app.set('views',path.join(__dirname, 'View'));

app.set('view engine', 'ejs');



app.use( express.static(path.join(__dirname, 'Public')));
app.use('/rentas/eventos/reservaciones',authController.hasRole('Cajero rentas'),ReservacionesEventosRouters);
app.use('/rentas',require('./utils/ContextoMenuRentas'));
app.use('/rentas', TurnoCajaRouter);


app.use('/admin', RentaInflablesRouter);

app.use('/admin', adminRoutes);


// Solo Administrador

app.use(
    '/admin/menu',
    authController.hasRole('Administrador'),
    categoriaRoutes
);

// Solo Administrador

app.use('/admin', authController.hasRole('Administrador'), inflableRoutes);


app.use( '/ordenes',  ordenRoutes);
app.use( '/ordenes', seguimientoRoutes);



app.use('/api/imagenes',imagenRoutes);


app.get(
    '/panel-imagenes',
    authController.hasRole('Administrador'),
    (req, res) => {
        return res.render('Imagenes');
    }
);


app.get('/', (req, res) => {
    return res.render('VistaPublico', {
        user: req.user
    });
});

app.get(
    '/inflables',
    InflableController.obtenerCatalogoPublico
);

app.use('/limpieza/inflables', LimpiezaInflablesRouter);

app.get('/restaurante', (req, res) => {
    return res.redirect('/menu');
});

//Salon
app.use('/admin', SalonesRouters);
app.get('/salones/catalogo', SalonesController.obtenerCatalogoPublico);
app.use('/admin', SonidoRouters);
app.use('/admin/manteles',MantelesRouters);
// ========================================
// GESTIÓN DE EVENTOS - CAJERO DE RENTAS
// ========================================

app.get(
    '/rentas/eventos',
    authController.hasRole('Cajero rentas'),
    (req, res) => {
        res.render('MenuEventos', {
            user: req.user
        });
    }
);

app.use('/rentas/paquetes', authController.hasRole('Cajero rentas'),PaquetesRouters);
app.use('/', router);

app.use(
    '/rentas/gestion',
    authController.hasRole('Cajero rentas'),
    GestionRentasRouters
);

app.use(
    '/rentas/cancelaciones/eventos',
    authController.hasRole('Cajero rentas'),
    crearCancelacionesRouter('eventos')
);

app.use(
    '/rentas/cancelaciones/inflables',
    authController.hasRole('Cajero rentas'),
    crearCancelacionesRouter('inflables')
);

app.use(
    '/restaurante/cancelaciones',
    authController.hasRole('Cajero restaurante'),
    crearCancelacionesRouter('restaurante')
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(
        ` funcionando en el puerto ${PORT}`
    );
});
