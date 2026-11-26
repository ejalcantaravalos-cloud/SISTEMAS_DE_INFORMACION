const db = require('../Database/db').promise();

class AgendaEventosModel {
    // Intervalo semiabierto: incluye reservas que comenzaron el mes anterior
    // y terminan dentro de este mes. No modifica ningún dato.
    static async consultar(inicio, siguiente) {
        const [salones] = await db.query(
            'SELECT id, nombre, capacidad, activo FROM salones ORDER BY nombre'
        );
        const [reservaciones] = await db.query(`
            SELECT rs.id, rs.reservacion_id, rs.salon_id, s.nombre AS salon,
                   r.nombre_evento, rs.estado,
                   DATE_FORMAT(rs.inicio, '%Y-%m-%dT%H:%i:%s') AS inicio,
                   DATE_FORMAT(rs.fin, '%Y-%m-%dT%H:%i:%s') AS fin
            FROM reservacion_salon rs
            INNER JOIN salones s ON s.id = rs.salon_id
            INNER JOIN reservaciones r ON r.id = rs.reservacion_id
            WHERE rs.inicio < ? AND rs.fin > ?
            ORDER BY rs.inicio, s.nombre, rs.id`, [siguiente, inicio]);
        return { salones, reservaciones };
    }
}
module.exports = AgendaEventosModel;
