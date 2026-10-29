const db = require('../Database/db').promise();

class InflableModel {
    static async obtenerTodos() {
        const [rows] = await db.query('SELECT * FROM juegos_inflables ORDER BY id_inflable DESC');
        return rows;
    }
//me falta poner el campo para url
    static async crear(nombre, medidas_espacio,  estado_disponibilidad) {
        const [result] = await db.query(
            'INSERT INTO juegos_inflables (nombre, medidas_espacio, estado_disponibilidad) VALUES (?, ?, ?)',
            [nombre, medidas_espacio, estado_disponibilidad || 'disponible']
        );
        return result.affectedRows > 0;
    }

    static async eliminar(id) {
        const [result] = await db.query('DELETE FROM juegos_inflables WHERE id_inflable = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = InflableModel;