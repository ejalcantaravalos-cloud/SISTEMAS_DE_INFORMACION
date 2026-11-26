'use strict';
const MenuAdminModel = require('../models/MenuAdminModel');

const responderError = (error, req, res) => {
  console.error('Error administrando menús:', error);
  const estado = error.status || 500;
  const mensaje = estado === 500 ? 'Ocurrió un error al procesar el menú.' : error.message;
  if (req.accepts('json') && req.get('Accept')?.includes('application/json')) {
    return res.status(estado).json({ ok: false, mensaje });
  }
  return res.redirect(303, '/admin/menu/menus?error=' + encodeURIComponent(mensaje));
};

const confirmar = (req, res, mensaje) => {
  if (req.get('Accept')?.includes('application/json')) {
    return res.json({ ok: true, mensaje });
  }
  return res.redirect(303, '/admin/menu/menus?ok=' + encodeURIComponent(mensaje));
};

exports.listar = async (req, res) => {
  try {
    const [menus, productos] = await Promise.all([
      MenuAdminModel.listar(), MenuAdminModel.productosDisponibles()
    ]);
    return res.render('adminMenus', {
      user: req.user,
      menus,
      productos,
      mensajeOk: typeof req.query.ok === 'string' ? req.query.ok : '',
      mensajeError: typeof req.query.error === 'string' ? req.query.error : ''
    });
  } catch (error) {
    console.error('Error al listar menús:', error);
    return res.status(500).send('No se pudieron cargar los menús.');
  }
};

exports.crear = async (req, res) => {
  try {
    await MenuAdminModel.guardar(req.body);
    return confirmar(req, res, 'Menú creado correctamente.');
  } catch (error) { return responderError(error, req, res); }
};

exports.editar = async (req, res) => {
  try {
    await MenuAdminModel.guardar(req.body, req.params.id);
    return confirmar(req, res, 'Menú actualizado correctamente.');
  } catch (error) { return responderError(error, req, res); }
};

exports.cambiarEstado = async (req, res) => {
  try {
    await MenuAdminModel.alternarEstado(req.params.id);
    return confirmar(req, res, 'Estado del menú actualizado.');
  } catch (error) { return responderError(error, req, res); }
};
