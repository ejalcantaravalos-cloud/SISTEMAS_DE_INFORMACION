const db = require('../Database/db').promise();

// Campos que se pueden editar desde el CRUD administrativo.
const camposSalon = [
    'nombre',
    'capacidad',
    'largo_m',
    'ancho_m',
    'alto_m',
    'tipo_salon',
    'descripcion',
    'ubicacion',
    'tarifa_base',
    'horas_incluidas',
    'tarifa_hora_extra',
    'deposito_limpieza'
];

function valoresSalon(datos) {
    return camposSalon.map(campo => datos[campo] ?? null);
}

async function transaccion(operacion) {
    const conexion = typeof db.getConnection === 'function'
        ? await db.getConnection()
        : db;

    try {
        await conexion.beginTransaction();

        const resultado = await operacion(conexion);

        await conexion.commit();

        return resultado;

    } catch (error) {
        await conexion.rollback();
        throw error;

    } finally {
        if (conexion !== db) conexion.release();
    }
}

// Bloquear el salón antes de modificar sus fotografías.
async function bloquearSalon(conexion, id) {
    const [rows] = await conexion.query(
        'SELECT id FROM salones WHERE id = ? FOR UPDATE',
        [id]
    );

    return rows.length > 0;
}

// Si no existe una portada válida, elegir la primera imagen.
const consultaSalon = `
    SELECT
        s.*,
        (s.largo_m * s.ancho_m) AS superficie_m2,
        i.url AS imagen,
        i.descripcion AS descripcion_imagen,
        i.id AS imagen_id

    FROM salones AS s

    LEFT JOIN imagen_salon AS i
        ON i.id = (
            SELECT i2.id
            FROM imagen_salon AS i2
            WHERE i2.salon_id = s.id
            ORDER BY i2.es_principal DESC, i2.id ASC
            LIMIT 1
        )
`;

class SalonModel {

    // ========================================
    // OBTENER TODOS LOS SALONES
    // ========================================

    static async obtenerTodos() {
        const [rows] = await db.query(
            `${consultaSalon} ORDER BY s.id DESC`
        );

        return rows;
    }

    // ========================================
    // OBTENER UN SALÓN POR SU ID
    // ========================================

    static async obtenerPorId(id) {
        const [rows] = await db.query(
            `${consultaSalon} WHERE s.id = ?`,
            [id]
        );

        return rows[0] || null;
    }

    // ========================================
    // OBTENER FOTOGRAFÍAS DE UN SALÓN
    // ========================================

    static async obtenerImagenes(id) {
        const [rows] = await db.query(
            `SELECT
                id,
                salon_id,
                url,
                descripcion,
                es_principal
             FROM imagen_salon
             WHERE salon_id = ?
             ORDER BY es_principal DESC, id ASC`,
            [id]
        );

        return rows;
    }

    // ========================================
    // CREAR UN SALÓN
    // ========================================

    static async crear(datos, imagenes = []) {

        // Comprobar que exista al menos una fotografía.
        if (
            !Array.isArray(imagenes) ||
            imagenes.length === 0 ||
            imagenes.some(imagen =>
                !imagen ||
                typeof imagen.url !== 'string' ||
                !imagen.url.trim()
            )
        ) {
            throw new Error(
                'Debes proporcionar al menos una fotografía válida.'
            );
        }

        return transaccion(async conexion => {

            const [result] = await conexion.query(
                `INSERT INTO salones
                    (${camposSalon.join(', ')})
                 VALUES
                    (${camposSalon.map(() => '?').join(', ')})`,
                valoresSalon(datos)
            );

            const idSalon = result.insertId;

            // Registrar todas las fotografías.
            for (let i = 0; i < imagenes.length; i++) {

                await conexion.query(
                    `INSERT INTO imagen_salon
                        (salon_id, url, descripcion, es_principal)
                     VALUES (?, ?, ?, ?)`,
                    [
                        idSalon,
                        imagenes[i].url,
                        imagenes[i].descripcion ?? null,

                        // La primera fotografía será la portada.
                        i === 0 ? 1 : 0
                    ]
                );
            }

            return idSalon;
        });
    }

    // ========================================
    // ACTUALIZAR DATOS DEL SALÓN
    // ========================================

    static async actualizar(id, datos) {

        return transaccion(async conexion => {

            // Comprobar que el salón exista.
            if (!(await bloquearSalon(conexion, id))) {
                return false;
            }

            await conexion.query(
                `UPDATE salones
                 SET ${camposSalon.map(campo =>
                     `${campo} = ?`
                 ).join(', ')}
                 WHERE id = ?`,
                [
                    ...valoresSalon(datos),
                    id
                ]
            );

            return true;
        });
    }

    // ========================================
    // ACTIVAR O DESACTIVAR UN SALÓN
    // ========================================

    static async cambiarActivo(id, activo) {

        if (typeof activo !== 'boolean') {
            throw new TypeError('activo debe ser booleano.');
        }

        return transaccion(async conexion => {

            if (!(await bloquearSalon(conexion, id))) {
                return false;
            }

            await conexion.query(
                `UPDATE salones
                 SET activo = ?
                 WHERE id = ?`,
                [
                    activo ? 1 : 0,
                    id
                ]
            );

            return true;
        });
    }

    // ========================================
    // AGREGAR UNA FOTOGRAFÍA
    // ========================================

    static async agregarImagen(
        id,
        url,
        descripcion = null
    ) {

        if (typeof url !== 'string' || !url.trim()) {
            throw new Error('La URL es obligatoria.');
        }

        return transaccion(async conexion => {

            if (!(await bloquearSalon(conexion, id))) {
                return false;
            }

            // Comprobar si ya tiene una portada.
            const [imagenes] = await conexion.query(
                `SELECT id
                 FROM imagen_salon
                 WHERE salon_id = ?
                 AND es_principal = 1
                 LIMIT 1`,
                [id]
            );

            const [result] = await conexion.query(
                `INSERT INTO imagen_salon
                    (salon_id, url, descripcion, es_principal)
                 VALUES (?, ?, ?, ?)`,
                [
                    id,
                    url,
                    descripcion,
                    imagenes.length === 0 ? 1 : 0
                ]
            );

            return result.insertId;
        });
    }

    // ========================================
    // ESTABLECER FOTOGRAFÍA DE PORTADA
    // ========================================

    static async establecerPortada(id, imagenId) {

        return transaccion(async conexion => {

            if (!(await bloquearSalon(conexion, id))) {
                return false;
            }

            // Comprobar que la imagen pertenezca al salón.
            const [imagenes] = await conexion.query(
                `SELECT id
                 FROM imagen_salon
                 WHERE salon_id = ?
                 AND id = ?`,
                [
                    id,
                    imagenId
                ]
            );

            if (!imagenes.length) {
                return false;
            }

            // Quitar la portada anterior.
            await conexion.query(
                `UPDATE imagen_salon
                 SET es_principal = 0
                 WHERE salon_id = ?`,
                [id]
            );

            // Establecer la nueva portada.
            await conexion.query(
                `UPDATE imagen_salon
                 SET es_principal = 1
                 WHERE salon_id = ?
                 AND id = ?`,
                [
                    id,
                    imagenId
                ]
            );

            return true;
        });
    }

    // ========================================
    // REEMPLAZAR UNA FOTOGRAFÍA
    // ========================================

    static async reemplazarImagen(
        id,
        imagenId,
        url,
        descripcion = null
    ) {

        if (typeof url !== 'string' || !url.trim()) {
            throw new Error('La URL es obligatoria.');
        }

        return transaccion(async conexion => {

            if (!(await bloquearSalon(conexion, id))) {
                return false;
            }

            // Obtener información de la fotografía anterior.
            const [imagenes] = await conexion.query(
                `SELECT *
                 FROM imagen_salon
                 WHERE salon_id = ?
                 AND id = ?`,
                [
                    id,
                    imagenId
                ]
            );

            if (!imagenes.length) {
                return false;
            }

            // Reemplazar sin cambiar su condición de portada.
            await conexion.query(
                `UPDATE imagen_salon
                 SET url = ?,
                     descripcion = ?
                 WHERE salon_id = ?
                 AND id = ?`,
                [
                    url,
                    descripcion,
                    id,
                    imagenId
                ]
            );

            // Devolver la imagen anterior para que el
            // controlador pueda gestionar el archivo viejo.
            return imagenes[0];
        });
    }

    // ========================================
    // ELIMINAR UNA FOTOGRAFÍA
    // ========================================

    static async eliminarImagen(id, imagenId) {

        return transaccion(async conexion => {

            if (!(await bloquearSalon(conexion, id))) {
                return false;
            }

            const [imagenes] = await conexion.query(
                `SELECT *
                 FROM imagen_salon
                 WHERE salon_id = ?
                 ORDER BY es_principal DESC, id ASC`,
                [id]
            );

            // Buscar la fotografía que se desea eliminar.
            const imagen = imagenes.find(
                item => String(item.id) === String(imagenId)
            );

            if (!imagen) {
                return false;
            }

            // Evitar que el salón se quede sin fotografías.
            if (imagenes.length === 1) {
                throw new Error(
                    'El salón debe conservar al menos una fotografía.'
                );
            }

            // Eliminar la fotografía seleccionada.
            await conexion.query(
                `DELETE FROM imagen_salon
                 WHERE salon_id = ?
                 AND id = ?`,
                [
                    id,
                    imagenId
                ]
            );

            // Conservar la portada actual o elegir otra.
            const portada = imagenes.find(
                item => item.id !== imagen.id
            );

            await conexion.query(
                `UPDATE imagen_salon
                 SET es_principal = 0
                 WHERE salon_id = ?`,
                [id]
            );

            await conexion.query(
                `UPDATE imagen_salon
                 SET es_principal = 1
                 WHERE salon_id = ?
                 AND id = ?`,
                [
                    id,
                    portada.id
                ]
            );

            // Devolver la fotografía eliminada.
            return imagen;
        });
    }
}

module.exports = SalonModel;