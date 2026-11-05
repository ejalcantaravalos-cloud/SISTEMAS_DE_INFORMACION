const db = require('../Database/db').promise();

class InflableModel {

    static async obtenerTodos() {
        const [rows] = await db.query(
            'SELECT * FROM juegos_inflables ORDER BY id_inflable DESC'
        );
        return rows;
    }

    // Crear inflable y devolver su ID
    static async crear(nombre, medidas_espacio, estado_disponibilidad) {
        const [result] = await db.query(
            `INSERT INTO juegos_inflables
            (nombre, medidas_espacio, estado_disponibilidad)
            VALUES (?, ?, ?)`,
            [nombre, medidas_espacio, estado_disponibilidad || 'disponible']
        );

        return result.insertId;
    }

    static async eliminar(id) {
        const [result] = await db.query(
            'DELETE FROM juegos_inflables WHERE id_inflable = ?',
            [id]
        );

        return result.affectedRows > 0;
    }
    

static async actualizar(
    id,
    nombre,
    medidas_espacio,
    estado_disponibilidad
) {
    // Comprobar si existe el inflable
    const [existentes] = await db.query(
        'SELECT id_inflable FROM juegos_inflables WHERE id_inflable = ?',
        [id]
    );

    console.log('Inflables encontrados:', existentes.length);

    if (existentes.length === 0) {
        return false;
    }

    // Actualizar sus datos
    const [resultado] = await db.query(
        `UPDATE juegos_inflables
         SET nombre = ?,
             medidas_espacio = ?,
             estado_disponibilidad = ?
         WHERE id_inflable = ?`,
        [
            nombre,
            medidas_espacio,
            estado_disponibilidad,
            id
        ]
    );

    console.log('Resultado MySQL:', resultado);

    return true;
}


}

module.exports = InflableModel;
