'use strict';
const conexion = require('../Database/db');
const db = conexion.promise();

function errorUsuario(mensaje, estado = 400) {
  const e = new Error(mensaje);
  e.status = estado;
  return e;
}

const idPositivo = (valor) => Number.isSafeInteger(Number(valor)) && Number(valor) > 0;

function validarDatos(datos) {
  if (typeof datos.nombre !== 'string' || !datos.nombre.trim() || datos.nombre.trim().length > 255) {
    throw errorUsuario('El nombre del platillo es obligatorio (máximo 255 caracteres).');
  }
  const precio = Number(datos.precio_base);
  if (datos.precio_base === '' || datos.precio_base == null || !Number.isFinite(precio) ||
      precio < 0 || !/^\d+(\.\d{1,2})?$/.test(String(datos.precio_base))) {
    throw errorUsuario('El precio debe ser positivo o cero y tener máximo dos decimales.');
  }
  if (datos.categoria_id && !idPositivo(datos.categoria_id)) {
    throw errorUsuario('Categoría inválida.');
  }
  if (!Array.isArray(datos.ingredientes) || datos.ingredientes.length === 0) {
    throw errorUsuario('Agrega al menos un ingrediente a la receta.');
  }
  const claves = new Set();
  for (const fila of datos.ingredientes) {
    if (!idPositivo(fila.ingrediente_id) || !['FIJO', 'REMOVIBLE', 'EXTRA'].includes(fila.tipo)) {
      throw errorUsuario('Hay un ingrediente o tipo inválido.');
    }
    const clave = `${Number(fila.ingrediente_id)}:${fila.tipo}`;
    if (claves.has(clave)) throw errorUsuario('Hay ingredientes repetidos del mismo tipo.');
    claves.add(clave);

    const cantidad = String(fila.cantidad_porcion);
    if (!/^\d+(\.\d{1,3})?$/.test(cantidad) || Number(cantidad) <= 0) {
      throw errorUsuario('La cantidad por porción debe ser mayor a cero (máximo tres decimales).');
    }
    if (fila.tipo === 'EXTRA') {
      const costo = String(fila.precio_extra);
      if (!/^\d+(\.\d{1,2})?$/.test(costo) || Number(costo) < 0) {
        throw errorUsuario('El precio de los extras debe ser válido (máximo dos decimales).');
      }
      if (!idPositivo(fila.max_porciones_extra)) {
        throw errorUsuario('Los extras necesitan un máximo de porciones mayor a cero.');
      }
    }
  }

  if (!Array.isArray(datos.menu_ids) || datos.menu_ids.some(x => !idPositivo(x))) {
    throw errorUsuario('Los menús seleccionados no son válidos.');
  }
}

async function catalogos() {
  const [categorias] = await db.query('SELECT id, nombre FROM categoria ORDER BY nombre');
  const [ingredientes] = await db.query(`
    SELECT i.id, iv.nombre, um.codigo AS unidad
    FROM ingrediente i
    INNER JOIN item_inventario iv ON iv.id = i.item_inventario_id
    INNER JOIN unidad_medida um ON um.id = iv.unidad_medida_id
    WHERE iv.activo = 1
    ORDER BY iv.nombre
  `);
  const [menus] = await db.query('SELECT id, nombre FROM menu WHERE activo = 1 ORDER BY nombre');
  return { categorias, ingredientes, menus };
}

async function listar() {
  const [productos] = await db.query(`
    SELECT p.id, p.nombre, p.descripcion, p.precio_base, p.categoria_id,
           p.imagen_url, p.activo, p.favorito, c.nombre AS categoria_nombre
    FROM producto p
    JOIN tipo_producto tp ON tp.id = p.tipo_producto_id AND tp.codigo = 'PREPARADO'
    LEFT JOIN categoria c ON c.id = p.categoria_id
    ORDER BY p.id DESC
  `);
  if (!productos.length) return [];

  const ids = productos.map(p => p.id);
  const [recetas] = await db.query(`
    SELECT pi.producto_id, pi.ingrediente_id, ti.codigo AS tipo,
           pi.cantidad_porcion, pi.precio_extra, pi.max_porciones_extra
    FROM platillo_ingrediente pi
    JOIN tipo_ingrediente ti ON ti.id = pi.tipo_ingrediente_id
    WHERE pi.producto_id IN (?) ORDER BY pi.id
  `, [ids]);
  const [menus] = await db.query(
    'SELECT producto_id, menu_id FROM menu_producto WHERE producto_id IN (?)', [ids]
  );
  const porProducto = new Map(productos.map(p => [p.id, { ...p, ingredientes: [], menu_ids: [] }]));
  for (const f of recetas) porProducto.get(f.producto_id).ingredientes.push(f);
  for (const m of menus) porProducto.get(m.producto_id).menu_ids.push(m.menu_id);
  return [...porProducto.values()];
}

async function validarCatalogos(conn, datos) {
  const [[tipoProducto]] = await conn.query(
    "SELECT id FROM tipo_producto WHERE codigo = 'PREPARADO'"
  );
  if (!tipoProducto) throw errorUsuario('Falta PREPARADO en tipo_producto.');

  const [tipos] = await conn.query(
    "SELECT id, codigo FROM tipo_ingrediente WHERE codigo IN ('FIJO','REMOVIBLE','EXTRA')"
  );
  const mapaTipos = Object.fromEntries(tipos.map(t => [t.codigo, t.id]));
  if (Object.keys(mapaTipos).length !== 3) {
    throw errorUsuario('Faltan tipos de ingrediente en la base de datos.');
  }

  const ingredienteIds = [...new Set(datos.ingredientes.map(x => Number(x.ingrediente_id)))];
  const [ingredientesValidos] = await conn.query(`
    SELECT i.id FROM ingrediente i
    JOIN item_inventario iv ON iv.id = i.item_inventario_id
    WHERE iv.activo = 1 AND i.id IN (?)
  `, [ingredienteIds]);
  if (ingredientesValidos.length !== ingredienteIds.length) {
    throw errorUsuario('Algún ingrediente no existe o está desactivado.');
  }

  const menuIds = [...new Set(datos.menu_ids.map(Number))];
  if (menuIds.length) {
    const [menus] = await conn.query('SELECT id FROM menu WHERE activo = 1 AND id IN (?)', [menuIds]);
    if (menus.length !== menuIds.length) throw errorUsuario('Hay un menú no disponible.');
  }
  if (datos.categoria_id) {
    const [cat] = await conn.query('SELECT id FROM categoria WHERE id = ?', [datos.categoria_id]);
    if (!cat.length) throw errorUsuario('La categoría no existe.');
  }
  return { tipoProductoId: tipoProducto.id, mapaTipos, menuIds };
}

async function guardarRelaciones(conn, productoId, datos, info, anteriores = []) {
  // Mantener los IDs de recetas existentes para no romper carritos que las referencian.
  const previos = new Map(anteriores.map(f => [`${f.ingrediente_id}:${f.tipo}`, f.id]));
  const usados = new Set();

  for (const f of datos.ingredientes) {
    const ingredienteId = Number(f.ingrediente_id);
    const clave = `${ingredienteId}:${f.tipo}`;
    const tipoId = info.mapaTipos[f.tipo];
    const cantidad = Number(f.cantidad_porcion);
    const extra = f.tipo === 'EXTRA' ? Number(f.precio_extra) : 0;
    const max = f.tipo === 'EXTRA' ? Number(f.max_porciones_extra) : null;

    if (previos.has(clave)) {
      const relacionId = previos.get(clave);
      usados.add(relacionId);
      await conn.query(`
        UPDATE platillo_ingrediente
        SET cantidad_porcion = ?, precio_extra = ?, max_porciones_extra = ?
        WHERE id = ?
      `, [cantidad, extra, max, relacionId]);
    } else {
      await conn.query(`
        INSERT INTO platillo_ingrediente
          (producto_id, ingrediente_id, tipo_ingrediente_id, cantidad_porcion, precio_extra, max_porciones_extra)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [productoId, ingredienteId, tipoId, cantidad, extra, max]);
    }
  }

  // Una receta usada por un carrito no podrá eliminarse hasta vaciar ese carrito.
  for (const f of anteriores) {
    if (!usados.has(f.id)) {
      try {
        await conn.query('DELETE FROM platillo_ingrediente WHERE id = ?', [f.id]);
      } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
          throw errorUsuario('No puedes quitar este ingrediente: está referenciado en un carrito. Vacía el carrito y vuelve a intentar.', 409);
        }
        throw error;
      }
    }
  }

  for (const menuId of info.menuIds) {
    await conn.query('INSERT INTO menu_producto (menu_id, producto_id) VALUES (?, ?)', [menuId, productoId]);
  }
}

async function guardar(datos, id = null) {
  validarDatos(datos);
  if (id !== null && !idPositivo(id)) throw errorUsuario('ID del platillo inválido.');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const info = await validarCatalogos(conn, datos);
    let productoId = id === null ? null : Number(id);
    let anteriores = [];

    if (productoId === null) {
      const [resultado] = await conn.query(`
        INSERT INTO producto
          (nombre, descripcion, precio_base, tipo_producto_id, categoria_id, imagen_url, activo, favorito)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0)
      `, [datos.nombre.trim(), datos.descripcion || null, Number(datos.precio_base),
          info.tipoProductoId, datos.categoria_id || null, datos.imagen_url || null]);
      productoId = resultado.insertId;
    } else {
      const [existe] = await conn.query(`
        SELECT p.id FROM producto p JOIN tipo_producto tp ON tp.id = p.tipo_producto_id
        WHERE p.id = ? AND tp.codigo = 'PREPARADO' FOR UPDATE
      `, [productoId]);
      if (!existe.length) throw errorUsuario('Platillo no encontrado.', 404);

      await conn.query(`
        UPDATE producto SET nombre = ?, descripcion = ?, precio_base = ?, categoria_id = ?,
          imagen_url = COALESCE(?, imagen_url)
        WHERE id = ?
      `, [datos.nombre.trim(), datos.descripcion || null, Number(datos.precio_base),
          datos.categoria_id || null, datos.imagen_url || null, productoId]);
      const [existentes] = await conn.query(`
        SELECT pi.id, pi.ingrediente_id, ti.codigo AS tipo
        FROM platillo_ingrediente pi
        JOIN tipo_ingrediente ti ON ti.id = pi.tipo_ingrediente_id
        WHERE pi.producto_id = ? FOR UPDATE
      `, [productoId]);
      anteriores = existentes;
      await conn.query('DELETE FROM menu_producto WHERE producto_id = ?', [productoId]);
    }

    await guardarRelaciones(conn, productoId, datos, info, anteriores);
    await conn.commit();
    return productoId;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function cambiarBandera(id, campo) {
  if (!idPositivo(id) || !['activo', 'favorito'].includes(campo)) {
    throw errorUsuario('Parámetros inválidos.');
  }
  const [resultado] = await db.query(`
    UPDATE producto p
    JOIN tipo_producto tp ON tp.id = p.tipo_producto_id AND tp.codigo = 'PREPARADO'
    SET p.${campo} = NOT p.${campo}
    WHERE p.id = ?
  `, [id]);
  if (!resultado.affectedRows) throw errorUsuario('Platillo no encontrado.', 404);
}

async function desactivar(id) {
  if (!idPositivo(id)) throw errorUsuario('ID inválido.');
  const [resultado] = await db.query(`
    UPDATE producto p
    JOIN tipo_producto tp ON tp.id = p.tipo_producto_id AND tp.codigo = 'PREPARADO'
    SET p.activo = 0 WHERE p.id = ?
  `, [id]);
  if (!resultado.affectedRows) throw errorUsuario('Platillo no encontrado.', 404);
}

async function menuPublico() {
  const [productos] = await db.query(`
    SELECT DISTINCT p.id, p.nombre, p.descripcion, p.precio_base AS precio,
           p.precio_base, p.imagen_url, p.favorito, p.categoria_id,
           c.nombre AS categoria_nombre
    FROM producto p
    JOIN tipo_producto tp ON tp.id = p.tipo_producto_id AND tp.codigo = 'PREPARADO'
    JOIN menu_producto mp ON mp.producto_id = p.id
    JOIN menu m ON m.id = mp.menu_id
    LEFT JOIN categoria c ON c.id = p.categoria_id
    WHERE p.activo = 1 AND m.activo = 1
      AND (m.inicio_vigencia IS NULL OR m.inicio_vigencia <= NOW())
      AND (m.fin_vigencia IS NULL OR m.fin_vigencia > NOW())
    ORDER BY categoria_nombre, p.nombre
  `);
  return productos;
}

// Menús públicos agrupados. Cada platillo aparece en TODOS los menús donde esté publicado.
async function menusPublicos() {
  const [filas] = await db.query(`
    SELECT m.id AS menu_id, m.nombre AS menu_nombre, m.descripcion AS menu_descripcion,
           p.id, p.nombre, p.descripcion, p.precio_base, p.imagen_url, p.favorito,
           c.nombre AS categoria_nombre
    FROM menu m
    INNER JOIN menu_producto mp ON mp.menu_id = m.id
    INNER JOIN producto p ON p.id = mp.producto_id AND p.activo = 1
    INNER JOIN tipo_producto tp ON tp.id = p.tipo_producto_id
      AND tp.codigo = 'PREPARADO'
    LEFT JOIN categoria c ON c.id = p.categoria_id
    WHERE m.activo = 1
      AND (m.inicio_vigencia IS NULL OR m.inicio_vigencia <= NOW())
      AND (m.fin_vigencia IS NULL OR m.fin_vigencia > NOW())
    ORDER BY m.nombre, m.id, c.nombre, p.nombre, p.id
  `);

  const menus = [];
  const porId = new Map();

  for (const fila of filas) {
    let menu = porId.get(fila.menu_id);
    if (!menu) {
      menu = {
        id: fila.menu_id,
        nombre: fila.menu_nombre,
        descripcion: fila.menu_descripcion,
        productos: []
      };
      porId.set(fila.menu_id, menu);
      menus.push(menu);
    }
    menu.productos.push({
      id: fila.id,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      precio_base: fila.precio_base,
      imagen_url: fila.imagen_url,
      favorito: fila.favorito,
      categoria_nombre: fila.categoria_nombre
    });
  }

  return menus;
}

module.exports = { catalogos, listar, guardar, cambiarBandera, desactivar, menuPublico, menusPublicos };
