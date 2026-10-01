const mysql = require('mysql2')
const dotenv = require('dotenv')
const path = require('path')

// Cargar .env asegurando la ruta exacta desde la ubicación de este archivo
dotenv.config({ path: path.join(__dirname, '../env/.env') })

// Si DB_HOST viene como 'db' o no existe, usamos 'mysql' que es el nombre en docker-compose
const hostBD = (!process.env.DB_HOST || process.env.DB_HOST === 'db') ? 'mysql' : process.env.DB_HOST

console.log('>>> Conectando a MySQL en el host:', hostBD)

const conexion = mysql.createPool({
  host: hostBD,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'contrasena',
  database: process.env.DB_DATABASE || 'UG',
  port: Number(process.env.DB_PORT) || 3306
})

module.exports = conexion