const conexion = require('../Database/db');
const db = conexion.promise();

const errorConEstado = (mensaje, estado = 400) => {
  const error = new Error(mensaje);
  error.status = estado;
  return error;
};

const validarDatos = (datos) => {
  const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
  const unidadId = Number(datos.unidad_medida_id);
  const manejaCaducidad = datos.maneja_caducidad === '1' ? 1 : 0;

  if (!nombre || nombre.length > 120) {
    throw errorConEstado('El nombre debe tener entre 1 y 120 caracteres.');
  }
  if (!Number.isSafeInteger(unidadId) || unidadId <= 0) {
    throw errorConEstado('Selecciona una unidad de medida válida.');
  }
  return { nombre, unidadId, manejaCaducidad };
};

// La cantidad y el costo pertenecen al LOTE, no al catálogo de ingredientes.
// Un mismo ingrediente puede tener varios lotes con distintos costos y caducidades.
const validarEntrada = (datos, opcional = false) => {
  const cantidadTexto = String(datos.cantidad ?? '').trim();
  const costoTexto = String(datos.costo_unitario ?? '').trim();
  const lote = typeof datos.codigo_lote === 'string' ? datos.codigo_lote.trim() : '';
  const caducidad = typeof datos.fecha_caducidad === 'string'
    ? datos.fecha_caducidad.trim() : '';

  if (opcional && !cantidadTexto && !costoTexto && !lote && !caducidad) {
    return null; // Crear el ingrediente sin existencias iniciales.
  }

  const patronCantidad = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;
  const patronCosto = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
  const cantidad = Number(cantidadTexto);
  const costo = Number(costoTexto);

  if (!patronCantidad.test(cantidadTexto) || !Number.isFinite(cantidad) ||
      cantidad <= 0 || cantidad > 999999999.999) {
    throw errorConEstado('La cantidad debe ser mayor a cero y tener hasta 3 decimales.');
  }
  if (!patronCosto.test(costoTexto) || !Number.isFinite(costo) ||
      costo < 0 || costo > 9999999999.99) {
    throw errorConEstado('Introduce el costo por unidad (hasta 2 decimales).');
  }
  if (lote.length > 80) {
    throw errorConEstado('El código del lote no debe superar 80 caracteres.');
  }
  if (caducidad && !/^\d{4}-\d{2}-\d{2}$/.test(caducidad)) {
    throw errorConEstado('La fecha de caducidad no es válida.');
  }
  return { cantidad: cantidadTexto, costo: costoTexto, lote: lote || null,
           caducidad: caducidad || null };
};

const insertarEntrada = async (connection, itemId, usuarioId, datos) => {
  const [lote] = await connection.query(`
    INSERT INTO lote_inventario
      (item_inventario_id, codigo_lote, fecha_ingreso, fecha_caducidad, costo_unitario)
    VALUES (?, ?, CURRENT_DATE(), ?, ?)
  `, [itemId, datos.lote, datos.caducidad, datos.costo]);

  await connection.query(`
    INSERT INTO movimiento_inventario
      (lote_inventario_id, usuario_id, tipo, cantidad, observaciones)
    VALUES (?, ?, 'ENTRADA', ?, 'Alta de existencias desde ingredientes')
  `, [lote.insertId, usuarioId, datos.cantidad]);
};

const IngredienteModel = {
  async listar() {
    const [filas] = await db.query(`
      SELECT
        i.id,
        ii.id AS item_inventario_id,
        ii.nombre,
        ii.unidad_medida_id,
        um.codigo AS unidad_codigo,
        um.nombre AS unidad_nombre,
        ii.activo,
        ii.maneja_caducidad,
        COALESCE(existencias.disponible, 0) AS cantidad_disponible,
        (SELECT li.costo_unitario FROM lote_inventario li
          WHERE li.item_inventario_id = ii.id
          ORDER BY li.fecha_ingreso DESC, li.id DESC LIMIT 1
        ) AS ultimo_costo_unitario
      FROM ingrediente AS i
      INNER JOIN item_inventario AS ii ON ii.id = i.item_inventario_id
      INNER JOIN unidad_medida AS um ON um.id = ii.unidad_medida_id
      LEFT JOIN (
        SELECT item_inventario_id,
               SUM(CASE WHEN caducado = 0 THEN disponible ELSE 0 END) AS disponible
        FROM v_existencia_lote
        GROUP BY item_inventario_id
      ) AS existencias ON existencias.item_inventario_id = ii.id
      ORDER BY ii.nombre ASC
    `);
    return filas;
  },

  async listarUnidades() {
    const [filas] = await db.query(
      'SELECT id, codigo, nombre FROM unidad_medida ORDER BY id'
    );
    return filas;
  },

  async crear(datos, usuarioId) {
    const { nombre, unidadId, manejaCaducidad } = validarDatos(datos);
    const entradaInicial = validarEntrada(datos, true);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [unidades] = await connection.query(
        'SELECT id FROM unidad_medida WHERE id = ?', [unidadId]
      );
      if (!unidades.length) throw errorConEstado('La unidad de medida no existe.');

      const [resultado] = await connection.query(`
        INSERT INTO item_inventario (nombre, unidad_medida_id, activo, maneja_caducidad)
        VALUES (?, ?, 1, ?)
      `, [nombre, unidadId, manejaCaducidad]);

      await connection.query(
        'INSERT INTO ingrediente (item_inventario_id) VALUES (?)',
        [resultado.insertId]
      );

      // Si se indica cantidad, registrar lote y entrada en la misma transacción.
      if (entradaInicial) {
        await insertarEntrada(connection, resultado.insertId, usuarioId, entradaInicial);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // Agregar una compra/entrada posterior sin modificar el catálogo.
  async registrarEntrada(id, usuarioId, datos) {
    const entrada = validarEntrada(datos);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [filas] = await connection.query(`
        SELECT ii.id AS item_id, ii.activo
        FROM ingrediente i
        JOIN item_inventario ii ON ii.id = i.item_inventario_id
        WHERE i.id = ? FOR UPDATE
      `, [id]);
      if (!filas.length) throw errorConEstado('Ingrediente no encontrado.', 404);
      if (Number(filas[0].activo) !== 1) {
        throw errorConEstado('No se pueden ingresar existencias a un ingrediente inactivo.');
      }
      await insertarEntrada(connection, filas[0].item_id, usuarioId, entrada);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async actualizar(id, datos) {
    const { nombre, unidadId, manejaCaducidad } = validarDatos(datos);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [actual] = await connection.query(`
        SELECT i.id, ii.id AS item_id, ii.unidad_medida_id
        FROM ingrediente i
        JOIN item_inventario ii ON ii.id = i.item_inventario_id
        WHERE i.id = ? FOR UPDATE
      `, [id]);
      if (!actual.length) throw errorConEstado('Ingrediente no encontrado.', 404);

      const [unidades] = await connection.query(
        'SELECT id FROM unidad_medida WHERE id = ?', [unidadId]
      );
      if (!unidades.length) throw errorConEstado('La unidad de medida no existe.');

      // No reinterpretar cantidades históricas o recetas existentes con otra unidad.
      if (Number(actual[0].unidad_medida_id) !== unidadId) {
        const [referencias] = await connection.query(`
          SELECT
            EXISTS (SELECT 1 FROM platillo_ingrediente
                    WHERE ingrediente_id = ? LIMIT 1) AS en_recetas,
            EXISTS (SELECT 1 FROM lote_inventario
                    WHERE item_inventario_id = ? LIMIT 1) AS en_lotes
        `, [id, actual[0].item_id]);
        if (referencias[0].en_recetas || referencias[0].en_lotes) {
          throw errorConEstado(
            'No se puede cambiar la unidad: el ingrediente ya tiene recetas o lotes asociados.'
          );
        }
      }

      await connection.query(`
        UPDATE item_inventario
        SET nombre = ?, unidad_medida_id = ?, maneja_caducidad = ?
        WHERE id = ?
      `, [nombre, unidadId, manejaCaducidad, actual[0].item_id]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // Baja lógica: no borrar ingredientes utilizados en recetas o inventario.
  async cambiarEstado(id, activo) {
    const [resultado] = await db.query(`
      UPDATE item_inventario ii
      INNER JOIN ingrediente i ON i.item_inventario_id = ii.id
      SET ii.activo = ?
      WHERE i.id = ?
    `, [activo, id]);
    if (!resultado.affectedRows) {
      throw errorConEstado('Ingrediente no encontrado.', 404);
    }
  }
};

module.exports = IngredienteModel;
