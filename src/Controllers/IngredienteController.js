const IngredienteModel = require('../models/IngredienteModel');

const ruta = '/admin/ingredientes';
const redirectCon = (res, clave, valor) =>
  res.redirect(`${ruta}?${clave}=${encodeURIComponent(valor)}`);

const procesarError = (error, res) => {
  console.error('Error en ingredientes:', error);
  if (error.code === 'ER_DUP_ENTRY') {
    return redirectCon(res, 'error', 'duplicado');
  }
  if (error.status === 400 || error.status === 404) {
    return redirectCon(res, 'error', 'validacion');
  }
  return redirectCon(res, 'error', 'servidor');
};

const obtenerId = (valor) => {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('Identificador inválido');
    error.status = 400;
    throw error;
  }
  return id;
};

exports.index = async (req, res, next) => {
  try {
    const [ingredientes, unidades] = await Promise.all([
      IngredienteModel.listar(),
      IngredienteModel.listarUnidades()
    ]);

    res.render('IngredientesVista', {
      ingredientes,
      unidades,
      user: req.user,
      ok: req.query.ok || '',
      error: req.query.error || ''
    });
  } catch (error) {
    next(error);
  }
};

exports.crear = async (req, res) => {
  try {
    await IngredienteModel.crear(req.body, req.user.id);
    return redirectCon(res, 'ok', 'creado');
  } catch (error) {
    return procesarError(error, res);
  }
};

exports.actualizar = async (req, res) => {
  try {
    await IngredienteModel.actualizar(obtenerId(req.params.id), req.body);
    return redirectCon(res, 'ok', 'actualizado');
  } catch (error) {
    return procesarError(error, res);
  }
};

exports.cambiarEstado = async (req, res) => {
  try {
    const id = obtenerId(req.params.id);
    if (!['0', '1'].includes(req.body.activo)) {
      const error = new Error('Estado inválido');
      error.status = 400;
      throw error;
    }
    await IngredienteModel.cambiarEstado(id, Number(req.body.activo));
    return redirectCon(res, 'ok', req.body.activo === '1' ? 'activado' : 'desactivado');
  } catch (error) {
    return procesarError(error, res);
  }
};

// Registrar una entrada sin cambiar de página cuando la vista usa fetch.
// El redirect se conserva como alternativa si el formulario se envía sin JS.
exports.registrarEntrada = async (req, res) => {
  const esperaJSON = (req.get('Accept') || '').includes('application/json');

  try {
    await IngredienteModel.registrarEntrada(
      obtenerId(req.params.id), req.user.id, req.body
    );

    if (esperaJSON) {
      return res.status(201).json({
        ok: true,
        mensaje: '¡Entrada de inventario guardada correctamente!'
      });
    }

    return redirectCon(res, 'ok', 'entrada');
  } catch (error) {
    if (esperaJSON) {
      console.error('Error al registrar entrada:', error);
      const estado = error.status === 400 || error.status === 404
        ? error.status
        : error.code === 'ER_DUP_ENTRY' ? 409 : 500;

      return res.status(estado).json({
        ok: false,
        mensaje: estado === 500
          ? 'No se pudo registrar la entrada. Revisa el servidor.'
          : error.message || 'Revisa los datos de la entrada.'
      });
    }

    return procesarError(error, res);
  }
};
