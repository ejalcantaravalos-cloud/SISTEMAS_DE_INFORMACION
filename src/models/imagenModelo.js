const conexion = require('../Database/db');

class Imagen {
    constructor() {
        this.conexion = conexion.promise();
    }

    // Crear imagen
    async crearImagen(titulo, url, public_id) {
        const sql = `
            INSERT INTO Imagen (Titulo, Imagen_URL, Public_ID)
            VALUES (?, ?, ?)
        `;

        await this.conexion.execute(sql, [titulo, url, public_id]);
        return true;
    }

    // Obtener todas las imágenes
    async obtenerTodos() {
        const sql = 'SELECT * FROM Imagen ORDER BY Fecha_Subida DESC';
        const [resultados] = await this.conexion.execute(sql);

        return resultados;
    }

    // Buscar imagen por ID
    async obtenerPorId(id) {
        const sql = 'SELECT * FROM Imagen WHERE ID_Imagen = ?';
        const [resultados] = await this.conexion.execute(sql, [id]);

        return resultados[0] || null;
    }

    // Buscar imagen por título
    async obtenerPorTitulo(titulo) {
        const sql = 'SELECT * FROM Imagen WHERE Titulo = ?';
        const [resultados] = await this.conexion.execute(sql, [titulo]);

        return resultados[0] || null;
    }

    // Eliminar imagen
    async eliminar(id) {
        const sql = 'DELETE FROM Imagen WHERE ID_Imagen = ?';
        const [resultado] = await this.conexion.execute(sql, [id]);

        return resultado.affectedRows > 0;
    }

    // Actualizar imagen
    async actualizar(id, titulo, url, public_id) {
        const sql = `
            UPDATE Imagen
            SET Titulo = ?, Imagen_URL = ?, Public_ID = ?
            WHERE ID_Imagen = ?
        `;

        await this.conexion.execute(sql, [titulo, url, public_id, id]);
        return true;
    }
}

module.exports = Imagen;
