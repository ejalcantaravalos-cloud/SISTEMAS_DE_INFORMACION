'use strict';
const PlatilloModel = require('../Models/PlatilloModel');
const cloudinary = require('../Database/Cloudinary');

// Cloudinary se usa solo para guardar la fotografía; las consultas SQL son del modelo.
function subirImagen(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'imagenesHelpingBee', resource_type: 'image' },
      (error, resultado) => error ? reject(error) : resolve(resultado)
    );
    stream.end(buffer);
  });
}

function leerDatos(req) {
  let ingredientes;
  try {
    ingredientes = JSON.parse(req.body.ingredientes_json || '[]');
  } catch {
    const error = new Error('La receta tiene un formato inválido.');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(ingredientes) || ingredientes.length > 100) {
    const error = new Error('La receta tiene demasiados ingredientes o es inválida.');
    error.status = 400;
    throw error;
  }
  const menus = req.body.menu_ids;
  return {
    nombre: req.body.nombre,
    descripcion: req.body.descripcion || '',
    precio_base: req.body.precio_base,
    categoria_id: req.body.categoria_id || null,
    ingredientes,
    menu_ids: menus == null ? [] : Array.isArray(menus) ? menus : [menus]
  };
}

function responderError(error, res) {
  console.error('Error de platillos:', error);
  const estado = error.status || (error.code === 'ER_DUP_ENTRY' ? 409 : 500);
  const mensaje = estado === 500 ? 'Ocurrió un error interno al guardar el platillo.' : error.message;
  return res.status(estado).send(mensaje);
}

exports.listarProductos = async (req, res) => {
  try {
    const [productos, catalogos] = await Promise.all([
      PlatilloModel.listar(), PlatilloModel.catalogos()
    ]);
    return res.render('adminProductos', { user: req.user, productos, ...catalogos,
      ok: req.query.ok || null });
  } catch (error) {
    return responderError(error, res);
  }
};

exports.crearProducto = async (req, res) => {
  let imagen = null;
  try {
    const datos = leerDatos(req);
    if (req.file) {
      imagen = await subirImagen(req.file.buffer);
      datos.imagen_url = imagen.secure_url;
    }
    await PlatilloModel.guardar(datos);
    return res.redirect('/admin/menu/productos?ok=creado');
  } catch (error) {
    if (imagen?.public_id) {
      try { await cloudinary.uploader.destroy(imagen.public_id); }
      catch (e) { console.warn('No se pudo revertir la imagen:', e.message); }
    }
    return responderError(error, res);
  }
};

exports.actualizarProducto = async (req, res) => {
  let imagen = null;
  try {
    const datos = leerDatos(req);
    if (req.file) {
      imagen = await subirImagen(req.file.buffer);
      datos.imagen_url = imagen.secure_url;
    }
    await PlatilloModel.guardar(datos, req.params.id);
    // No se elimina la imagen previa porque el esquema solo conserva su URL.
    return res.redirect('/admin/menu/productos?ok=actualizado');
  } catch (error) {
    if (imagen?.public_id) {
      try { await cloudinary.uploader.destroy(imagen.public_id); }
      catch (e) { console.warn('No se pudo revertir la imagen:', e.message); }
    }
    return responderError(error, res);
  }
};

exports.toggleProducto = async (req, res) => {
  try {
    await PlatilloModel.cambiarBandera(req.params.id, 'activo');
    return res.redirect('/admin/menu/productos?ok=estado');
  } catch (error) { return responderError(error, res); }
};

// En esta base la columna se llama favorito, no especial.
exports.toggleEspecial = async (req, res) => {
  try {
    await PlatilloModel.cambiarBandera(req.params.id, 'favorito');
    return res.redirect('/admin/menu/productos?ok=favorito');
  } catch (error) { return responderError(error, res); }
};

// Evita DELETE físico: una orden histórica puede referenciar este producto.
exports.EliminarProducto = async (req, res) => {
  try {
    await PlatilloModel.desactivar(req.params.id);
    return res.redirect('/admin/menu/productos?ok=desactivado');
  } catch (error) { return responderError(error, res); }
};

// Menú público organizado por menús activos y vigentes.
exports.catalogoPublico = async (req, res) => {
  try {
    const menus = await PlatilloModel.menusPublicos();
    return res.render('MenuPublico', { menus, user: req.user || null });
  } catch (error) {
    return responderError(error, res);
  }
};
