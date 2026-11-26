
const db = require('../Database/db').promise();

class InflableModel {

    // Obtener todos los inflables con su imagen de portada
static async obtenerTodos() {
    const [rows] = await db.query(
        `SELECT
            j.*,
            i.url AS imagen,
            i.descripcion AS descripcion_imagen,
            r.resultado AS estado_revision,
            r.fecha AS fecha_revision
         FROM juegos_inflables AS j

         LEFT JOIN imagen_inflable AS i
            ON i.id = (
                SELECT MIN(i2.id)
                FROM imagen_inflable AS i2
                WHERE i2.inflable_id = j.id
            )

         LEFT JOIN revision_inflable AS r
            ON r.id = (
                SELECT MAX(r2.id)
                FROM revision_inflable AS r2
                WHERE r2.inflable_id = j.id
            )

         ORDER BY j.id DESC`
    );

    return rows;
}

    // Crear un inflable con su imagen
    static async crear(
        nombre,
        largo_m,
        ancho_m,
        alto_m,
        requisitos_instalacion,
        precio_completo,
        imagen_url = null,
        descripcion_imagen = null
    ) {
        const conexion =
            typeof db.getConnection === 'function'
                ? await db.getConnection()
                : db;

        try {
            await conexion.beginTransaction();

            const [result] = await conexion.query(
                `INSERT INTO juegos_inflables
                 (nombre, largo_m, ancho_m, alto_m,
                  requisitos_instalacion, precio_completo)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    nombre,
                    largo_m,
                    ancho_m,
                    alto_m,
                    requisitos_instalacion,
                    precio_completo
                ]
            );

            const idInflable = result.insertId;

            // Guardar la imagen si existe
            if (imagen_url) {
                await conexion.query(
                    `INSERT INTO imagen_inflable
                     (inflable_id, url, descripcion)
                     VALUES (?, ?, ?)`,
                    [
                        idInflable,
                        imagen_url,
                        descripcion_imagen
                    ]
                );
            }

            await conexion.commit();

            return idInflable;

        } catch (error) {
            await conexion.rollback();
            throw error;

        } finally {
            if (conexion !== db) {
                conexion.release();
            }
        }
    }

    // Actualizar datos y opcionalmente la imagen
    static async actualizar(
        id,
        nombre,
        largo_m,
        ancho_m,
        alto_m,
        requisitos_instalacion,
        precio_completo,
        imagen_url = null,
        descripcion_imagen = null
    ) {
        const conexion =
            typeof db.getConnection === 'function'
                ? await db.getConnection()
                : db;

        try {
            await conexion.beginTransaction();

            // Comprobar que exista
            const [existentes] = await conexion.query(
                `SELECT id
                 FROM juegos_inflables
                 WHERE id = ?
                 FOR UPDATE`,
                [id]
            );

            if (existentes.length === 0) {
                await conexion.rollback();
                return false;
            }

            // Actualizar datos principales
            await conexion.query(
                `UPDATE juegos_inflables
                 SET nombre = ?,
                     largo_m = ?,
                     ancho_m = ?,
                     alto_m = ?,
                     requisitos_instalacion = ?,
                     precio_completo = ?
                 WHERE id = ?`,
                [
                    nombre,
                    largo_m,
                    ancho_m,
                    alto_m,
                    requisitos_instalacion,
                    precio_completo,
                    id
                ]
            );

            // Solo actualizar imagen si llega una nueva
            if (imagen_url) {
                const [imagenes] = await conexion.query(
                    `SELECT id
                     FROM imagen_inflable
                     WHERE inflable_id = ?
                     ORDER BY id ASC
                     LIMIT 1
                     FOR UPDATE`,
                    [id]
                );

                if (imagenes.length > 0) {
                    // Reemplazar la portada
                    await conexion.query(
                        `UPDATE imagen_inflable
                         SET url = ?, descripcion = ?
                         WHERE id = ?`,
                        [
                            imagen_url,
                            descripcion_imagen,
                            imagenes[0].id
                        ]
                    );

                } else {
                    // Crear imagen si no tenía una
                    await conexion.query(
                        `INSERT INTO imagen_inflable
                         (inflable_id, url, descripcion)
                         VALUES (?, ?, ?)`,
                        [
                            id,
                            imagen_url,
                            descripcion_imagen
                        ]
                    );
                }
            }

            await conexion.commit();

            return true;

        } catch (error) {
            await conexion.rollback();
            throw error;

        } finally {
            if (conexion !== db) {
                conexion.release();
            }
        }
    }

    // Activar o desactivar un inflable
    static async cambiarActivo(id, activo) {
        const [result] = await db.query(
            `UPDATE juegos_inflables
             SET activo = ?
             WHERE id = ?`,
            [activo ? 1 : 0, id]
        );

        return result.affectedRows > 0;
    }

    // Eliminar un inflable definitivamente
    static async eliminar(id) {
        const [result] = await db.query(
            `DELETE FROM juegos_inflables
             WHERE id = ?`,
            [id]
        );

        return result.affectedRows > 0;
    }

    static async registrarRevision(
    id,
    usuarioId,
    resultado,
    observaciones = null
) {
    const [result] = await db.query(
        `INSERT INTO revision_inflable
         (inflable_id, usuario_id, resultado, observaciones)
         VALUES (?, ?, ?, ?)`,
        [id, usuarioId, resultado, observaciones]
    );

    return result.insertId;
}

// OBTENER UN INFLABLE POR SU ID
static async obtenerPorId(id) {
    const [rows] = await db.query(
        `SELECT
            j.*,
            i.url AS imagen,
            i.descripcion AS descripcion_imagen
         FROM juegos_inflables AS j
         LEFT JOIN imagen_inflable AS i
            ON i.id = (
                SELECT MIN(i2.id)
                FROM imagen_inflable AS i2
                WHERE i2.inflable_id = j.id
            )
         WHERE j.id = ?`,
        [id]
    );

    return rows[0] || null;
}

}



module.exports = InflableModel;
