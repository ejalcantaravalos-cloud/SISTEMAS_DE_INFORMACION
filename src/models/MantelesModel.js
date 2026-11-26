const db = require('../Database/db').promise();

class MantelesModel {

    // OBTENER TODOS LOS MANTELES

    static async obtenerTodos() {

        const [rows] = await db.query(`
            SELECT *
            FROM manteles
            ORDER BY id DESC
        `);

        return rows;
    }


    // OBTENER MANTEL POR ID

    static async obtenerPorId(id) {

        const [rows] = await db.query(`
            SELECT *
            FROM manteles
            WHERE id = ?
        `, [id]);

        return rows[0] || null;
    }


    // REGISTRAR MANTEL

    static async crear(datos) {

        const [resultado] = await db.query(`
            INSERT INTO manteles (
                nombre,
                descripcion,
                color,
                codigo_color,
                forma,
                medidas,
                precio_renta,
                stock_total,
                imagen_url,
                imagen_public_id,
                activo
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `, [
            datos.nombre,
            datos.descripcion,
            datos.color,
            datos.codigo_color,
            datos.forma,
            datos.medidas,
            datos.precio_renta,
            datos.stock_total,
            datos.imagen_url,
            datos.imagen_public_id
        ]);

        return resultado.insertId;
    }


    // ACTUALIZAR MANTEL

    static async actualizar(id, datos, imagenAnterior = null) {

        const valores = [
            datos.nombre,
            datos.descripcion,
            datos.color,
            datos.codigo_color,
            datos.forma,
            datos.medidas,
            datos.precio_renta,
            datos.stock_total
        ];

        let consulta = `
            UPDATE manteles
            SET nombre = ?,
                descripcion = ?,
                color = ?,
                codigo_color = ?,
                forma = ?,
                medidas = ?,
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


    // ACTIVAR O DESACTIVAR MANTEL

    static async cambiarActivo(id, activo) {

        const [resultado] = await db.query(`
            UPDATE manteles
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
            UPDATE manteles
            SET imagen_url = NULL,
                imagen_public_id = NULL
            WHERE id = ?
            AND imagen_public_id <=> ?
        `, [id, publicId]);

        return resultado.affectedRows > 0;
    }

}

module.exports = MantelesModel;