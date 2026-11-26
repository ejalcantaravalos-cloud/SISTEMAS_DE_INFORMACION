'use strict';
const conexion = require('../Database/db');
const db = conexion.promise();

function errorValidacion(mensaje, status = 400) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

const idValido = valor => Number.isSafeInteger(Number(valor)) && Number(valor) > 0;

function fechaSQL(valor, etiqueta) {
  if (valor == null || valor === '') return null;
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) {
    throw errorValidacion(`La ${etiqueta} no tiene un formato válido.`);
  }
  const [fecha, hora] = valor.split('T');
  const [y, m, d] = fecha.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d, hh, mm));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m-1 || f.getUTCDate() !== d ||
      f.getUTCHours() !== hh || f.getUTCMinutes() !== mm) {
    throw errorValidacion(`La ${etiqueta} no existe.`);
  }
  return `${fecha} ${hora}:00`;
}

function validarEntrada(datos) {
  if (typeof datos.nombre !== 'string' || !datos.nombre.trim() || datos.nombre.trim().length > 120) {
    throw errorValidacion('El nombre es obligatorio y puede tener hasta 120 caracteres.');
  }
  if (datos.descripcion != null && (typeof datos.descripcion !== 'string' || datos.descripcion.length > 5000)) {
    throw errorValidacion('La descripción debe tener máximo 5000 caracteres.');
  }
  const inicio = fechaSQL(datos.inicio_vigencia, 'fecha de inicio');
  const fin = fechaSQL(datos.fin_vigencia, 'fecha de finalización');
  if (inicio && fin && fin <= inicio) {
    throw errorValidacion('La fecha de finalización debe ser posterior al inicio.');
  }

  const entrada = datos.producto_ids == null ? [] :
    Array.isArray(datos.producto_ids) ? datos.producto_ids : [datos.producto_ids];
  if (entrada.length > 500 || entrada.some(valor => !idValido(valor))) {
    throw errorValidacion('La selección de productos no es válida.');
  }
  const productoIds = [...new Set(entrada.map(Number))];
  return {
    nombre: datos.nombre.trim(),
    descripcion: (datos.descripcion || '').trim() || null,
    inicio, fin, productoIds
  };
}

async function listar() {
  const [menus] = await db.query(`
    SELECT m.id, m.nombre, m.descripcion, m.activo,
      DATE_FORMAT(m.inicio_vigencia, '%Y-%m-%dT%H:%i') AS inicio_input,
      DATE_FORMAT(m.fin_vigencia, '%Y-%m-%dT%H:%i') AS fin_input,
      DATE_FORMAT(m.inicio_vigencia, '%d/%m/%Y %H:%i') AS inicio_texto,
      DATE_FORMAT(m.fin_vigencia, '%d/%m/%Y %H:%i') AS fin_texto,
      CASE
        WHEN m.activo = 0 THEN 'Inactivo'
        WHEN m.inicio_vigencia IS NOT NULL AND m.inicio_vigencia > NOW() THEN 'Programado'
        WHEN m.fin_vigencia IS NOT NULL AND m.fin_vigencia <= NOW() THEN 'Finalizado'
        ELSE 'Vigente'
      END AS estado_publicacion
    FROM menu m ORDER BY m.id DESC
  `);
  if (!menus.length) return [];
  const ids = menus.map(m => m.id);
  const [relaciones] = await db.query(`
    SELECT menu_id, producto_id FROM menu_producto
    WHERE menu_id IN (?) ORDER BY producto_id
  `, [ids]);
  const mapa = new Map(menus.map(menu => [menu.id, {...menu, producto_ids: []}]));
  for (const fila of relaciones) mapa.get(fila.menu_id).producto_ids.push(fila.producto_id);
  return [...mapa.values()];
}

async function productosDisponibles() {
  const [productos] = await db.query(`
    SELECT p.id, p.nombre, p.precio_base, p.activo,
           tp.nombre AS tipo_nombre
    FROM producto p
    JOIN tipo_producto tp ON tp.id = p.tipo_producto_id
    ORDER BY p.nombre, p.id
  `);
  return productos;
}

async function guardar(datos, id = null) {
  const limpio = validarEntrada(datos);
  if (id !== null && !idValido(id)) throw errorValidacion('ID de menú inválido.');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (limpio.productoIds.length) {
      const [existentes] = await connection.query(
        'SELECT id FROM producto WHERE id IN (?)', [limpio.productoIds]
      );
      if (existentes.length !== limpio.productoIds.length) {
        throw errorValidacion('Hay productos seleccionados que ya no existen.');
      }
    }

    const [duplicados] = await connection.query(
      'SELECT id FROM menu WHERE nombre = ? AND id <> ? LIMIT 1',
      [limpio.nombre, id === null ? 0 : Number(id)]
    );
    if (duplicados.length) throw errorValidacion('Ya existe un menú con ese nombre.', 409);

    let menuId;
    if (id === null) {
      const [result] = await connection.query(`
        INSERT INTO menu (nombre, descripcion, inicio_vigencia, fin_vigencia, activo)
        VALUES (?, ?, ?, ?, 1)
      `, [limpio.nombre, limpio.descripcion, limpio.inicio, limpio.fin]);
      menuId = result.insertId;
    } else {
      menuId = Number(id);
      const [result] = await connection.query(`
        UPDATE menu
        SET nombre = ?, descripcion = ?, inicio_vigencia = ?, fin_vigencia = ?
        WHERE id = ?
      `, [limpio.nombre, limpio.descripcion, limpio.inicio, limpio.fin, menuId]);
      if (!result.affectedRows) throw errorValidacion('El menú no existe.', 404);
      await connection.query('DELETE FROM menu_producto WHERE menu_id = ?', [menuId]);
    }

    for (const productoId of limpio.productoIds) {
      await connection.query(
        'INSERT INTO menu_producto (menu_id, producto_id) VALUES (?, ?)',
        [menuId, productoId]
      );
    }
    await connection.commit();
    return menuId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function alternarEstado(id) {
  if (!idValido(id)) throw errorValidacion('ID de menú inválido.');
  const [resultado] = await db.query(
    'UPDATE menu SET activo = IF(activo = 1, 0, 1) WHERE id = ?',
    [Number(id)]
  );
  if (!resultado.affectedRows) throw errorValidacion('El menú no existe.', 404);
}

module.exports = { listar, productosDisponibles, guardar, alternarEstado };
