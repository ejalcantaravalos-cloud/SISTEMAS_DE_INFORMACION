const mysql = require('mysql2');
const dotenv = require('dotenv');
const path = require('path');

// Cargar variables de entorno
dotenv.config({
  path: path.join(__dirname, '../env/.env')
});

// Configuración del host para Docker
const hostBD =
  (!process.env.DB_HOST || process.env.DB_HOST === 'db')
    ? 'mysql'
    : process.env.DB_HOST;

console.log('>>> Conectando a MySQL en:', hostBD);

// Crear pool de conexiones
const conexion = mysql.createPool({
  host: hostBD,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Comprobar conexión y base seleccionada
conexion.query(
  'SELECT DATABASE() AS base_actual',
  (error, results) => {
    if (error) {
      console.error('Error de conexión a MySQL:', error.message);
    } else {
      console.log(
        '>>> Base de datos conectada:',
        results[0].base_actual
      );
    }
  }
);

module.exports = conexion;
