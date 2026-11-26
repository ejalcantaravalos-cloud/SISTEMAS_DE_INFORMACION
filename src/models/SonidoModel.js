const db = require('../Database/db').promise();

class SonidoModel {

    // OBTENER TODOS LOS EQUIPOS

    static async obtenerTodos() {

        const [rows] = await db.query(`
            SELECT *
            FROM sonido
            ORDER BY id DESC
        `);

        return rows;
    }


    // OBTENER EQUIPO POR ID

    static async obtenerPorId(id) {

        const [rows] = await db.query(`
            SELECT *
            FROM sonido
            WHERE id = ?
        `, [id]);

        return rows[0] || null;
    }


    // REGISTRAR EQUIPO

    static async crear(datos) {

        const [resultado] = await db.query(`
            INSERT INTO sonido (
                nombre,
                descripcion,
                precio_renta,
                stock_total,
                imagen_url,
                imagen_public_id,
                activo
            )
            VALUES (?, ?, ?, ?, ?, ?, 1)
        `, [
            datos.nombre,
            datos.descripcion,
            datos.precio_renta,
            datos.stock_total,
            datos.imagen_url,
            datos.imagen_public_id
        ]);

        return resultado.insertId;
    }


    // ACTUALIZAR EQUIPO

    static async actualizar(id, datos, imagenAnterior = null) {

        const valores = [
            datos.nombre,
            datos.descripcion,
            datos.precio_renta,
            datos.stock_total
        ];

        let consulta = `
            UPDATE sonido
            SET nombre = ?,
                descripcion = ?,
                precio_renta = ?,
                stock_total = ?
        `;

        if (datos.imagen_public_id) {

            consulta += `,
                imagen_url = ?,
                imagen_public_id = ?
            `;

            valores.push(
                datos.imagen_url,
                datos.imagen_public_id
            );
        }

        consulta += ' WHERE id = ?';

        valores.push(id);

        // Evitar reemplazar una imagen modificada
        // simultáneamente por otra solicitud.

        if (datos.imagen_public_id) {

            consulta += ' AND imagen_public_id <=> ?';

            valores.push(imagenAnterior);
        }

        const [resultado] = await db.query(
            consulta,
            valores
        );

        return resultado.affectedRows > 0;
    }


    // CAMBIAR ESTADO

    static async cambiarActivo(id, activo) {

        const [resultado] = await db.query(`
            UPDATE sonido
            SET activo = ?
            WHERE id = ?
        `, [
            activo ? 1 : 0,
            id
        ]);

        return resultado.affectedRows > 0;
    }


    // ELIMINAR FOTOGRAFÍA

    static async eliminarImagen(id, publicId) {

        const [resultado] = await db.query(`
            UPDATE sonido
            SET imagen_url = NULL,
                imagen_public_id = NULL
            WHERE id = ?
            AND imagen_public_id <=> ?
        `, [id, publicId]);

        return resultado.affectedRows > 0;
    }

}

module.exports = SonidoModel;