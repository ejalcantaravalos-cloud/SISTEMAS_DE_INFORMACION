-- Active: 1787261648708@@localhost@3307@EventosyRenta

-- =====================================
-- 01_PERSONAS
-- =====================================
CREATE TABLE IF NOT EXISTS `rol` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(60) NOT NULL,
  `descripcion` VARCHAR(255),
  PRIMARY KEY (`id`),
  UNIQUE KEY (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `activo` BOOLEAN NOT NULL DEFAULT 1,
  `creado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usuario_rol` (
  `usuario_id` INT NOT NULL,
  `rol_id` INT NOT NULL,
  PRIMARY KEY (`usuario_id`, `rol_id`),
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`rol_id`) REFERENCES `rol`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `clientes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(120) NOT NULL,
  `telefono` VARCHAR(30),
  `email` VARCHAR(150),
  `creado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 02_OPERACIONES
-- =====================================
CREATE TABLE IF NOT EXISTS `area_servicio` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(20) NOT NULL,
  `nombre` VARCHAR(80) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `operacion` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `cliente_id` INT,
  `usuario_id` INT NOT NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `observaciones` TEXT,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `servicio_contratado` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `operacion_id` INT NOT NULL,
  `area_servicio_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`operacion_id`) REFERENCES `operacion`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`area_servicio_id`) REFERENCES `area_servicio`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 03_RESTAURANTE
-- =====================================
CREATE TABLE IF NOT EXISTS `tipo_producto` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(20) NOT NULL,
  `nombre` VARCHAR(80) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `categoria` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(100) NOT NULL,
  `descripcion` TEXT,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `producto` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(255) NOT NULL,
  `descripcion` TEXT,
  `precio_base` DECIMAL(12,2) NOT NULL,
  `tipo_producto_id` INT NOT NULL,
  `categoria_id` INT,
  `imagen_url` VARCHAR(500),
  `activo` BOOLEAN NOT NULL DEFAULT 1,
  `favorito` BOOLEAN NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`tipo_producto_id`) REFERENCES `tipo_producto`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`categoria_id`) REFERENCES `categoria`(`id`) ON DELETE SET NULL,
  CHECK (precio_base >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `menu` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(120) NOT NULL,
  `descripcion` TEXT,
  `inicio_vigencia` DATETIME,
  `fin_vigencia` DATETIME,
  `activo` BOOLEAN NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CHECK (fin_vigencia IS NULL OR inicio_vigencia IS NULL OR fin_vigencia > inicio_vigencia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `menu_producto` (
  `menu_id` INT NOT NULL,
  `producto_id` INT NOT NULL,
  PRIMARY KEY (`menu_id`, `producto_id`),
  FOREIGN KEY (`menu_id`) REFERENCES `menu`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`producto_id`) REFERENCES `producto`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `grupo_Preferencia` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(100) NOT NULL,
  `tipo_seleccion` ENUM('UNICO','MULTIPLE') NOT NULL DEFAULT 'UNICO',
  `requerido` BOOLEAN NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Preferencia` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `grupo_Preferencia_id` INT NOT NULL,
  `nombre` VARCHAR(100) NOT NULL,
  `ajuste_precio` DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`grupo_Preferencia_id`, `nombre`),
  FOREIGN KEY (`grupo_Preferencia_id`) REFERENCES `grupo_Preferencia`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `producto_grupo_Preferencia` (
  `producto_id` INT NOT NULL,
  `grupo_Preferencia_id` INT NOT NULL,
  PRIMARY KEY (`producto_id`, `grupo_Preferencia_id`),
  FOREIGN KEY (`producto_id`) REFERENCES `producto`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`grupo_Preferencia_id`) REFERENCES `grupo_Preferencia`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 04_INVENTARIO
-- =====================================
CREATE TABLE IF NOT EXISTS `unidad_medida` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(10) NOT NULL,
  `nombre` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `item_inventario` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(120) NOT NULL,
  `unidad_medida_id` INT NOT NULL,
  `activo` BOOLEAN NOT NULL DEFAULT 1,
  `maneja_caducidad` BOOLEAN NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`nombre`),
  FOREIGN KEY (`unidad_medida_id`) REFERENCES `unidad_medida`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ingrediente` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `item_inventario_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`item_inventario_id`),
  FOREIGN KEY (`item_inventario_id`) REFERENCES `item_inventario`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tipo_ingrediente` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(20) NOT NULL,
  `nombre` VARCHAR(60) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `platillo_ingrediente` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `producto_id` INT NOT NULL,
  `ingrediente_id` INT NOT NULL,
  `tipo_ingrediente_id` INT NOT NULL,
  `cantidad_porcion` DECIMAL(12,3) NOT NULL,
  `precio_extra` DECIMAL(12,2) NOT NULL,
  `max_porciones_extra` INT,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`producto_id`, `ingrediente_id`, `tipo_ingrediente_id`),
  FOREIGN KEY (`producto_id`) REFERENCES `producto`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`ingrediente_id`) REFERENCES `ingrediente`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`tipo_ingrediente_id`) REFERENCES `tipo_ingrediente`(`id`) ON DELETE RESTRICT,
  CHECK (cantidad_porcion > 0),
  CHECK (precio_extra >= 0),
  CHECK (max_porciones_extra IS NULL OR max_porciones_extra > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `producto_empaquetado_inventario` (
  `producto_id` INT NOT NULL,
  `item_inventario_id` INT NOT NULL,
  `cantidad_unidad` DECIMAL(12,3) NOT NULL DEFAULT 1,
  PRIMARY KEY (`producto_id`),
  FOREIGN KEY (`producto_id`) REFERENCES `producto`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`item_inventario_id`) REFERENCES `item_inventario`(`id`) ON DELETE RESTRICT,
  CHECK (cantidad_unidad > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lote_inventario` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `item_inventario_id` INT NOT NULL,
  `codigo_lote` VARCHAR(80),
  `fecha_ingreso` DATE NOT NULL,
  `fecha_caducidad` DATE,
  `costo_unitario` DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`item_inventario_id`) REFERENCES `item_inventario`(`id`) ON DELETE RESTRICT,
  CHECK (costo_unitario >= 0),
  CHECK (fecha_caducidad IS NULL OR fecha_caducidad >= fecha_ingreso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 05_RESERVACIONES
-- =====================================
CREATE TABLE IF NOT EXISTS `salones` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(120) NOT NULL,
  `capacidad` INT NOT NULL,
  `descripcion` TEXT,
  `ubicacion` VARCHAR(255),
  `tarifa_base` DECIMAL(12,2) NOT NULL,
  `activo` BOOLEAN NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`nombre`),
  CHECK (capacidad > 0),
  CHECK (tarifa_base >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE salones

ADD CONSTRAINT chk_salon_largo
CHECK (largo_m > 0),

ADD CONSTRAINT chk_salon_ancho
CHECK (ancho_m > 0),

ADD CONSTRAINT chk_salon_alto
CHECK (alto_m > 0),

ADD CONSTRAINT chk_salon_horas
CHECK (horas_incluidas > 0),

ADD CONSTRAINT chk_salon_hora_extra
CHECK (tarifa_hora_extra >= 0),

ADD CONSTRAINT chk_salon_deposito
CHECK (deposito_limpieza >= 0);

ALTER TABLE imagen_salon

ADD COLUMN es_principal BOOLEAN
NOT NULL DEFAULT 0
AFTER descripcion;

CREATE TABLE IF NOT EXISTS `imagen_salon` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `salon_id` INT NOT NULL,
  `url` VARCHAR(500) NOT NULL,
  `descripcion` VARCHAR(255),
  PRIMARY KEY (`id`),
  FOREIGN KEY (`salon_id`) REFERENCES `salones`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `juegos_inflables` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(120) NOT NULL,
  `largo_m` DECIMAL(7,2),
  `ancho_m` DECIMAL(7,2),
  `alto_m` DECIMAL(7,2),
  `requisitos_instalacion` TEXT,
  `precio_completo` DECIMAL(12,2) NOT NULL,
  `activo` BOOLEAN NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CHECK (precio_completo >= 0),
  CHECK (largo_m IS NULL OR largo_m > 0),
  CHECK (ancho_m IS NULL OR ancho_m > 0),
  CHECK (alto_m IS NULL OR alto_m > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


i.precio_completo AS tarifa_base
CREATE TABLE IF NOT EXISTS `imagen_inflable` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `inflable_id` INT NOT NULL,
  `url` VARCHAR(500) NOT NULL,
  `descripcion` VARCHAR(255),
  PRIMARY KEY (`id`),
  FOREIGN KEY (`inflable_id`) REFERENCES `juegos_inflables`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reservaciones` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `cliente_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `nombre_evento` VARCHAR(150),
  `tipo_evento` VARCHAR(80),
  `numero_invitados` INT,
  `evento_con_menores` BOOLEAN NOT NULL DEFAULT 0,
  `creada_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `observaciones` TEXT,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT,
  CHECK (numero_invitados IS NULL OR numero_invitados > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reservacion_salon` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `reservacion_id` INT NOT NULL,
  `salon_id` INT NOT NULL,
  `servicio_contratado_id` INT NOT NULL,
  `inicio` DATETIME NOT NULL,
  `fin` DATETIME NOT NULL,
  `tarifa_acordada` DECIMAL(12,2) NOT NULL,
  `deposito_limpieza_acordado` DECIMAL(12,2) NOT NULL,
  `estado` ENUM('Reservada','En uso','Finalizada','Cancelada') NOT NULL DEFAULT 'Reservada',
  PRIMARY KEY (`id`),
  UNIQUE KEY (`servicio_contratado_id`),
  FOREIGN KEY (`reservacion_id`) REFERENCES `reservaciones`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`salon_id`) REFERENCES `salones`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`servicio_contratado_id`) REFERENCES `servicio_contratado`(`id`) ON DELETE RESTRICT,
  CHECK (fin > inicio),
  CHECK (tarifa_acordada >= 0),
  CHECK (deposito_limpieza_acordado >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sonido (
    id INT NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT,
    precio_renta DECIMAL(12,2) NOT NULL,
    stock_total INT NOT NULL DEFAULT 1,
    imagen_url VARCHAR(500),
    imagen_public_id VARCHAR(255),
    activo BOOLEAN NOT NULL DEFAULT 1,

    PRIMARY KEY (id),

    CHECK (precio_renta >= 0),
    CHECK (stock_total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manteles (
    id INT NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT,
    color VARCHAR(50) NOT NULL,
    codigo_color CHAR(7) NOT NULL,

    forma ENUM(
        'Redondo',
        'Rectangular',
        'Cuadrado'
    ) NOT NULL,

    medidas VARCHAR(100) NOT NULL,
    precio_renta DECIMAL(12,2) NOT NULL,
    stock_total INT NOT NULL DEFAULT 0,
    imagen_url VARCHAR(500),
    imagen_public_id VARCHAR(255),
    activo BOOLEAN NOT NULL DEFAULT 1,

    PRIMARY KEY (id),

    CHECK (precio_renta >= 0),
    CHECK (stock_total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE tipo_paquete (
    id INT NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(50) NOT NULL,
    descripcion VARCHAR(255),

    PRIMARY KEY (id),
    UNIQUE KEY (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

INSERT INTO tipo_paquete (nombre, descripcion)
VALUES
(
    'Sencillo',
    'Incluye la renta del salón y un juego inflable.'
),
(
    'Preparado',
    'Incluye servicios previamente configurados.'
),
(
    'Personalizado',
    'Permite seleccionar los servicios a según el cliente indique su necesidad.'
);

CREATE TABLE paquetes (
    id INT NOT NULL AUTO_INCREMENT,
    tipo_paquete_id INT NOT NULL,

    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT,

    precio_adicional DECIMAL(12,2) NOT NULL DEFAULT 0,

    min_invitados INT NOT NULL DEFAULT 1,
    max_invitados INT,

    cantidad_meseros INT NOT NULL DEFAULT 0,

    imagen_url VARCHAR(500),
    imagen_public_id VARCHAR(255),

    activo BOOLEAN NOT NULL DEFAULT 1,

    PRIMARY KEY (id),
    UNIQUE KEY (nombre),

    FOREIGN KEY (tipo_paquete_id)
        REFERENCES tipo_paquete(id)
        ON DELETE RESTRICT,

    CHECK (precio_adicional >= 0),

    CHECK (min_invitados > 0),

    CHECK (
        max_invitados IS NULL
        OR max_invitados >= min_invitados
    ),

    CHECK (cantidad_meseros >= 0)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE paquete_salon (
    paquete_id INT NOT NULL,
    salon_id INT NOT NULL,

    PRIMARY KEY (paquete_id, salon_id),

    FOREIGN KEY (paquete_id)
        REFERENCES paquetes(id)
        ON DELETE CASCADE,

    FOREIGN KEY (salon_id)
        REFERENCES salones(id)
        ON DELETE RESTRICT

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE paquete_menu (
    paquete_id INT NOT NULL,
    menu_id INT NOT NULL,

    porciones_incluidas INT NOT NULL,
    precio_porcion_extra DECIMAL(12,2),

    PRIMARY KEY (paquete_id, menu_id),

    FOREIGN KEY (paquete_id)
        REFERENCES paquetes(id)
        ON DELETE CASCADE,

    FOREIGN KEY (menu_id)
        REFERENCES menu(id)
        ON DELETE RESTRICT,

    CHECK (porciones_incluidas > 0),
    CHECK (precio_porcion_extra >= 0)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE paquete_sonido (
    paquete_id INT NOT NULL,
    sonido_id INT NOT NULL,
    cantidad INT NOT NULL DEFAULT 1,

    PRIMARY KEY (paquete_id, sonido_id),

    FOREIGN KEY (paquete_id)
        REFERENCES paquetes(id)
        ON DELETE CASCADE,

    FOREIGN KEY (sonido_id)
        REFERENCES sonido(id)
        ON DELETE RESTRICT,

    CHECK (cantidad > 0)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE paquete_mantel (
    paquete_id INT NOT NULL,
    mantel_id INT NOT NULL,
    cantidad INT NOT NULL DEFAULT 1,

    PRIMARY KEY (paquete_id, mantel_id),

    FOREIGN KEY (paquete_id)
        REFERENCES paquetes(id)
        ON DELETE CASCADE,

    FOREIGN KEY (mantel_id)
        REFERENCES manteles(id)
        ON DELETE RESTRICT,

    CHECK (cantidad > 0)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;



-- Ejecutar en EventosyRenta. No elimina datos ni cambia tablas anteriores.
CREATE TABLE IF NOT EXISTS reservacion_paquete (
    reservacion_id INT PRIMARY KEY,
    reservacion_salon_id INT NOT NULL UNIQUE,
    paquete_id INT NOT NULL,
    menu_id INT NULL,
    nombre_paquete VARCHAR(120) NOT NULL,
    precio_paquete DECIMAL(12,2) NOT NULL,
    tarifa_salon DECIMAL(12,2) NOT NULL,
    cantidad_meseros INT NOT NULL DEFAULT 0,
    tarifa_mesero DECIMAL(12,2) NOT NULL DEFAULT 0,
    FOREIGN KEY (reservacion_id) REFERENCES reservaciones(id) ON DELETE RESTRICT,
    FOREIGN KEY (reservacion_salon_id) REFERENCES reservacion_salon(id) ON DELETE RESTRICT,
    FOREIGN KEY (paquete_id) REFERENCES paquetes(id) ON DELETE RESTRICT,
    FOREIGN KEY (menu_id) REFERENCES menu(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

ALTER TABLE reservacion_paquete MODIFY COLUMN paquete_id INT NULL;


CREATE TABLE IF NOT EXISTS reservacion_paquete_comida (
    reservacion_id INT NOT NULL,
    producto_id INT NOT NULL,
    cantidad INT NOT NULL,
    cantidad_incluida INT NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    importe DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (reservacion_id, producto_id),
    FOREIGN KEY (reservacion_id) REFERENCES reservacion_paquete(reservacion_id) ON DELETE RESTRICT,
    FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reservacion_paquete_mantel (
    reservacion_id INT NOT NULL,
    mantel_id INT NOT NULL,
    cantidad INT NOT NULL,
    cantidad_incluida INT NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    importe DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (reservacion_id, mantel_id),
    FOREIGN KEY (reservacion_id) REFERENCES reservacion_paquete(reservacion_id) ON DELETE RESTRICT,
    FOREIGN KEY (mantel_id) REFERENCES manteles(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reservacion_paquete_sonido (
    reservacion_id INT NOT NULL,
    sonido_id INT NOT NULL,
    cantidad INT NOT NULL,
    cantidad_incluida INT NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    importe DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (reservacion_id, sonido_id),
    FOREIGN KEY (reservacion_id) REFERENCES reservacion_paquete(reservacion_id) ON DELETE RESTRICT,
    FOREIGN KEY (sonido_id) REFERENCES sonido(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

|------------------------------------------------------|
Inflables
|------------------------------------------------------|

CREATE TABLE IF NOT EXISTS `reservacion_inflable` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `reservacion_id` INT NOT NULL,
  `inflable_id` INT NOT NULL,
  `servicio_contratado_id` INT NOT NULL,
  `incluido_en_reservacion_salon_id` INT,
  `inicio` DATETIME NOT NULL,
  `fin` DATETIME NOT NULL,
  `tarifa_acordada` DECIMAL(12,2) NOT NULL,
  `estado` ENUM('Reservada','En uso','Finalizada','Cancelada') NOT NULL DEFAULT 'Reservada',
  PRIMARY KEY (`id`),
  UNIQUE KEY (`servicio_contratado_id`),
  FOREIGN KEY (`reservacion_id`) REFERENCES `reservaciones`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`inflable_id`) REFERENCES `juegos_inflables`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`servicio_contratado_id`) REFERENCES `servicio_contratado`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`incluido_en_reservacion_salon_id`) REFERENCES `reservacion_salon`(`id`) ON DELETE SET NULL,
  CHECK (fin > inicio),
  CHECK (tarifa_acordada >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE reservacion_inflable

ADD COLUMN direccion_instalacion VARCHAR(300) NULL,

ADD COLUMN referencias_ubicacion TEXT NULL,

ADD COLUMN tipo_lugar ENUM(
    'DOMICILIO',
    'SALON_CERRADO',
    'ESPACIO_ABIERTO',
    'OTRO'
) NULL,

ADD COLUMN fecha_instalacion DATE NULL;
-- =====================================
-- 06_PEDIDOS
-- =====================================
CREATE TABLE IF NOT EXISTS `ficha_entrega` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `numero` INT NOT NULL,
  `activo` BOOLEAN NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`numero`),
  CHECK (numero > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `carrito` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `producto_id` INT NOT NULL,
  `cantidad` INT NOT NULL DEFAULT 1,
  `nota_cocina` TEXT,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`producto_id`) REFERENCES `producto`(`id`) ON DELETE RESTRICT,
  CHECK (cantidad > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `carrito_opcion` (
  `carrito_id` INT NOT NULL,
  `opcion_id` INT NOT NULL,
  PRIMARY KEY (`carrito_id`, `opcion_id`),
  FOREIGN KEY (`carrito_id`) REFERENCES `carrito`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`opcion_id`) REFERENCES `Preferencia`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `carrito_ingrediente` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `carrito_id` INT NOT NULL,
  `platillo_ingrediente_id` INT NOT NULL,
  `accion` ENUM('QUITAR','EXTRA') NOT NULL,
  `porciones` INT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`carrito_id`, `platillo_ingrediente_id`, `accion`),
  FOREIGN KEY (`carrito_id`) REFERENCES `carrito`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`platillo_ingrediente_id`) REFERENCES `platillo_ingrediente`(`id`) ON DELETE RESTRICT,
  CHECK (porciones > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pedido` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `servicio_contratado_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `reservacion_id` INT,
  `ficha_entrega_id` INT,
  `tipo_entrega` ENUM('EN_LOCAL','PARA_LLEVAR','EVENTO') NOT NULL DEFAULT 'EN_LOCAL',
  `nombre_referencia` VARCHAR(120),
  `estado` ENUM('Enviado','Orden tomada','Listo para entregar','Cancelado','Entregado') NOT NULL DEFAULT 'Enviado',
  `version` INT UNSIGNED NOT NULL DEFAULT 1,
  `nota` TEXT,
  `fecha_pedido` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_entrega` DATETIME,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`servicio_contratado_id`),
  FOREIGN KEY (`servicio_contratado_id`) REFERENCES `servicio_contratado`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`reservacion_id`) REFERENCES `reservaciones`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`ficha_entrega_id`) REFERENCES `ficha_entrega`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `detalle_pedido` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `pedido_id` INT NOT NULL,
  `producto_id` INT NOT NULL,
  `nombre_producto_historico` VARCHAR(255) NOT NULL,
  `cantidad` INT NOT NULL,
  `precio_unitario` DECIMAL(12,2) NOT NULL,
  `nota_cocina` TEXT,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`pedido_id`) REFERENCES `pedido`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`producto_id`) REFERENCES `producto`(`id`) ON DELETE RESTRICT,
  CHECK (cantidad > 0),
  CHECK (precio_unitario >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `detalle_pedido_opcion` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `detalle_pedido_id` INT NOT NULL,
  `preferencia_id` INT,
  `nombre_opcion_historico` VARCHAR(100) NOT NULL,
  `ajuste_precio_unitario` DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`detalle_pedido_id`) REFERENCES `detalle_pedido`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`preferencia_id`) REFERENCES `Preferencia`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `detalle_pedido_ingrediente` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `detalle_pedido_id` INT NOT NULL,
  `ingrediente_id` INT,
  `nombre_ingrediente_historico` VARCHAR(120) NOT NULL,
  `accion` ENUM('INCLUIDO','QUITADO','EXTRA') NOT NULL,
  `porciones` INT NOT NULL DEFAULT 1,
  `cantidad_inventario_por_unidad` DECIMAL(12,3) NOT NULL,
  `precio_extra_unitario` DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`detalle_pedido_id`) REFERENCES `detalle_pedido`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`ingrediente_id`) REFERENCES `ingrediente`(`id`) ON DELETE SET NULL,
  CHECK (porciones > 0),
  CHECK (cantidad_inventario_por_unidad >= 0),
  CHECK (precio_extra_unitario >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reserva_inventario` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `detalle_pedido_id` INT NOT NULL,
  `lote_inventario_id` INT NOT NULL,
  `cantidad` DECIMAL(12,3) NOT NULL,
  `estado` ENUM('RESERVADA','CONSUMIDA','LIBERADA') NOT NULL DEFAULT 'RESERVADA',
  `creada_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`detalle_pedido_id`) REFERENCES `detalle_pedido`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`lote_inventario_id`) REFERENCES `lote_inventario`(`id`) ON DELETE RESTRICT,
  CHECK (cantidad > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `movimiento_inventario` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `lote_inventario_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `detalle_pedido_id` INT,
  `tipo` ENUM('ENTRADA','CONSUMO','MERMA','AJUSTE_POS','AJUSTE_NEG','DEVOLUCION') NOT NULL,
  `cantidad` DECIMAL(12,3) NOT NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `observaciones` VARCHAR(255),
  PRIMARY KEY (`id`),
  FOREIGN KEY (`lote_inventario_id`) REFERENCES `lote_inventario`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`detalle_pedido_id`) REFERENCES `detalle_pedido`(`id`) ON DELETE SET NULL,
  CHECK (cantidad > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 07_CONTROL_RENTAS
-- =====================================
CREATE TABLE IF NOT EXISTS `inspeccion_salon` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `reservacion_salon_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `momento` ENUM('ANTES','DESPUES') NOT NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `limpio` BOOLEAN,
  `observaciones` TEXT,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`reservacion_salon_id`) REFERENCES `reservacion_salon`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `evidencia_inspeccion_salon` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `inspeccion_salon_id` INT NOT NULL,
  `url` VARCHAR(500) NOT NULL,
  `descripcion` VARCHAR(255),
  PRIMARY KEY (`id`),
  FOREIGN KEY (`inspeccion_salon_id`) REFERENCES `inspeccion_salon`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `revision_inflable` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `inflable_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `reservacion_inflable_id` INT,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resultado` ENUM('DISPONIBLE','REQUIERE_LIMPIEZA','MANTENIMIENTO','FUERA_SERVICIO') NOT NULL,
  `observaciones` TEXT,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`inflable_id`) REFERENCES `juegos_inflables`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`reservacion_inflable_id`) REFERENCES `reservacion_inflable`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contrato` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `reservacion_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `folio` VARCHAR(60) NOT NULL,
  `tipo` ENUM('SALON','INFLABLE','MIXTO') NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `archivo_pdf_url` VARCHAR(500),
  `fecha_generacion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_firma` DATETIME,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`folio`),
  UNIQUE KEY (`reservacion_id`, `tipo`, `version`),
  FOREIGN KEY (`reservacion_id`) REFERENCES `reservaciones`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT,
  CHECK (version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cancelacion` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `servicio_contratado_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `motivo` TEXT NOT NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`servicio_contratado_id`),
  FOREIGN KEY (`servicio_contratado_id`) REFERENCES `servicio_contratado`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 08_FINANZAS
-- =====================================
CREATE TABLE IF NOT EXISTS `metodo_pago` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(30) NOT NULL,
  `nombre` VARCHAR(80) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `concepto_pago` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(30) NOT NULL,
  `nombre` VARCHAR(80) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `caja` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(100) NOT NULL,
  `activo` BOOLEAN NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `turno_caja` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `caja_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `apertura` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cierre` DATETIME,
  `fondo_inicial` DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`caja_id`) REFERENCES `caja`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT,
  CHECK (fondo_inicial >= 0),
  CHECK (cierre IS NULL OR cierre >= apertura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pago` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `operacion_id` INT NOT NULL,
  `metodo_pago_id` INT NOT NULL,
  `turno_caja_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `importe` DECIMAL(12,2) NOT NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `referencia` VARCHAR(120),
  PRIMARY KEY (`id`),
  FOREIGN KEY (`operacion_id`) REFERENCES `operacion`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`metodo_pago_id`) REFERENCES `metodo_pago`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`turno_caja_id`) REFERENCES `turno_caja`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT,
  CHECK (importe > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pago_aplicacion` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `pago_id` INT NOT NULL,
  `servicio_contratado_id` INT NOT NULL,
  `concepto_pago_id` INT NOT NULL,
  `importe` DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`pago_id`) REFERENCES `pago`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`servicio_contratado_id`) REFERENCES `servicio_contratado`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`concepto_pago_id`) REFERENCES `concepto_pago`(`id`) ON DELETE RESTRICT,
  CHECK (importe > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `solicitud_devolucion` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `servicio_contratado_id` INT NOT NULL,
  `cancelacion_id` INT,
  `usuario_id` INT NOT NULL,
  `motivo` TEXT NOT NULL,
  `estado` ENUM('SOLICITADA','APROBADA','RECHAZADA','CERRADA') NOT NULL DEFAULT 'SOLICITADA',
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`servicio_contratado_id`) REFERENCES `servicio_contratado`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`cancelacion_id`) REFERENCES `cancelacion`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `devolucion` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `solicitud_devolucion_id` INT NOT NULL,
  `metodo_pago_id` INT NOT NULL,
  `turno_caja_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `importe` DECIMAL(12,2) NOT NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `referencia` VARCHAR(120),
  PRIMARY KEY (`id`),
  FOREIGN KEY (`solicitud_devolucion_id`) REFERENCES `solicitud_devolucion`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`metodo_pago_id`) REFERENCES `metodo_pago`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`turno_caja_id`) REFERENCES `turno_caja`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT,
  CHECK (importe > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `movimiento_caja` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `turno_caja_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `tipo` ENUM('APORTE','RETIRO','AJUSTE_POS','AJUSTE_NEG') NOT NULL,
  `importe` DECIMAL(12,2) NOT NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `motivo` VARCHAR(255),
  PRIMARY KEY (`id`),
  FOREIGN KEY (`turno_caja_id`) REFERENCES `turno_caja`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT,
  CHECK (importe > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `corte_caja` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `turno_caja_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `efectivo_contado` DECIMAL(12,2) NOT NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `observaciones` TEXT,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`turno_caja_id`),
  FOREIGN KEY (`turno_caja_id`) REFERENCES `turno_caja`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT,
  CHECK (efectivo_contado >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE corte_caja
ADD COLUMN efectivo_esperado DECIMAL(12,2) NULL
AFTER efectivo_contado,

ADD COLUMN diferencia DECIMAL(12,2)
GENERATED ALWAYS AS (
    efectivo_contado - efectivo_esperado
) STORED
AFTER efectivo_esperado;

CREATE OR REPLACE VIEW v_estado_cajas AS
SELECT
    c.id AS caja_id,
    c.nombre AS nombre_caja,
    c.activo,
    t.id AS turno_caja_id,
    t.usuario_id,
    t.apertura,
    t.fondo_inicial,
    CASE
        WHEN t.id IS NOT NULL THEN 'OCUPADA'
        WHEN c.activo = 0 THEN 'DESHABILITADA'
        ELSE 'DISPONIBLE'
    END AS estado
FROM caja c
LEFT JOIN turno_caja t
    ON c.id = t.caja_id
    AND t.cierre IS NULL;

CREATE OR REPLACE VIEW v_resumen_turno_caja AS
SELECT
    t.id AS turno_caja_id,
    t.caja_id,
    t.usuario_id,
    t.apertura,
    t.cierre,
    t.fondo_inicial,

    COALESCE(p.efectivo, 0) AS pagos_efectivo,
    COALESCE(p.tarjeta, 0) AS pagos_tarjeta,
    COALESCE(p.transferencia, 0) AS pagos_transferencia,
    COALESCE(p.total, 0) AS total_cobrado,

    COALESCE(d.total, 0) AS devoluciones_efectivo,
    COALESCE(g.total, 0) AS gastos_efectivo,

    COALESCE(m.aportes, 0) AS aportes,
    COALESCE(m.retiros, 0) AS retiros,
    COALESCE(m.ajustes_pos, 0) AS ajustes_positivos,
    COALESCE(m.ajustes_neg, 0) AS ajustes_negativos,

    (
        t.fondo_inicial
        + COALESCE(p.efectivo, 0)
        + COALESCE(m.aportes, 0)
        + COALESCE(m.ajustes_pos, 0)
        - COALESCE(d.total, 0)
        - COALESCE(g.total, 0)
        - COALESCE(m.retiros, 0)
        - COALESCE(m.ajustes_neg, 0)
    ) AS efectivo_esperado

FROM turno_caja t

LEFT JOIN (
    SELECT
        p.turno_caja_id,
        SUM(CASE WHEN mp.codigo = 'EFECTIVO'
            THEN p.importe ELSE 0 END) AS efectivo,
        SUM(CASE WHEN mp.codigo = 'TARJETA'
            THEN p.importe ELSE 0 END) AS tarjeta,
        SUM(CASE WHEN mp.codigo = 'TRANSFERENCIA'
            THEN p.importe ELSE 0 END) AS transferencia,
        SUM(p.importe) AS total
    FROM pago p
    JOIN metodo_pago mp ON p.metodo_pago_id = mp.id
    GROUP BY p.turno_caja_id
) p ON t.id = p.turno_caja_id

LEFT JOIN (
    SELECT
        d.turno_caja_id,
        SUM(d.importe) AS total
    FROM devolucion d
    JOIN metodo_pago mp ON d.metodo_pago_id = mp.id
    WHERE mp.codigo = 'EFECTIVO'
    GROUP BY d.turno_caja_id
) d ON t.id = d.turno_caja_id

LEFT JOIN (
    SELECT
        g.turno_caja_id,
        SUM(g.importe) AS total
    FROM gasto g
    JOIN metodo_pago mp ON g.metodo_pago_id = mp.id
    WHERE mp.codigo = 'EFECTIVO'
    GROUP BY g.turno_caja_id
) g ON t.id = g.turno_caja_id

LEFT JOIN (
    SELECT
        turno_caja_id,
        SUM(CASE WHEN tipo = 'APORTE'
            THEN importe ELSE 0 END) AS aportes,
        SUM(CASE WHEN tipo = 'RETIRO'
            THEN importe ELSE 0 END) AS retiros,
        SUM(CASE WHEN tipo = 'AJUSTE_POS'
            THEN importe ELSE 0 END) AS ajustes_pos,
        SUM(CASE WHEN tipo = 'AJUSTE_NEG'
            THEN importe ELSE 0 END) AS ajustes_neg
    FROM movimiento_caja
    GROUP BY turno_caja_id
) m ON t.id = m.turno_caja_id;

CREATE TABLE IF NOT EXISTS reagendacion (
    id INT NOT NULL AUTO_INCREMENT,
    servicio_contratado_id INT NOT NULL,
    usuario_id INT NOT NULL,
    inicio_anterior DATETIME NOT NULL,
    fin_anterior DATETIME NOT NULL,
    inicio_nuevo DATETIME NOT NULL,
    fin_nuevo DATETIME NOT NULL,
    motivo TEXT NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_reagendacion_servicio (servicio_contratado_id, fecha),
    FOREIGN KEY (servicio_contratado_id) REFERENCES servicio_contratado(id) ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    CHECK (fin_anterior > inicio_anterior),
    CHECK (fin_nuevo > inicio_nuevo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW v_historial_cortes AS
SELECT
    cc.id AS corte_id,
    t.id AS turno_caja_id,
    c.nombre AS caja,
    u.nombre AS cajero,
    uc.nombre AS responsable_corte,
    t.apertura,
    t.cierre,
    t.fondo_inicial,
    cc.efectivo_esperado,
    cc.efectivo_contado,
    cc.diferencia,
    cc.fecha AS fecha_corte,
    cc.observaciones,
    CASE
        WHEN cc.diferencia IS NULL THEN 'SIN DATOS'
        WHEN cc.diferencia = 0 THEN 'CUADRADA'
        WHEN cc.diferencia > 0 THEN 'SOBRANTE'
        ELSE 'FALTANTE'
    END AS resultado
FROM corte_caja cc
JOIN turno_caja t ON cc.turno_caja_id = t.id
JOIN caja c ON t.caja_id = c.id
JOIN usuarios u ON t.usuario_id = u.id
JOIN usuarios uc ON cc.usuario_id = uc.id;

----------------------------------------------------------


INSERT IGNORE INTO concepto_pago (codigo, nombre)
VALUES ('RETENCION_REAGENDA', 'Apartado retenido por reagendación');

CREATE TABLE IF NOT EXISTS reagendacion_finanzas (
    reagendacion_id INT NOT NULL,
    responsable ENUM('cliente', 'negocio') NOT NULL,
    apartado_objetivo DECIMAL(12,2) NOT NULL,
    importe_retenido DECIMAL(12,2) NOT NULL,
    importe_conservado DECIMAL(12,2) NOT NULL,
    anticipo_pendiente DECIMAL(12,2) NOT NULL,
    saldo_pendiente DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (reagendacion_id),
    FOREIGN KEY (reagendacion_id) REFERENCES reagendacion(id) ON DELETE RESTRICT,
    CHECK (apartado_objetivo >= 0 AND importe_retenido >= 0 AND importe_conservado >= 0
        AND anticipo_pendiente >= 0 AND saldo_pendiente >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reagendacion_retencion (
    reagendacion_id INT NOT NULL,
    pago_aplicacion_id INT NOT NULL,
    concepto_original_id INT NOT NULL,
    importe DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (reagendacion_id, pago_aplicacion_id),
    UNIQUE KEY (pago_aplicacion_id),
    FOREIGN KEY (reagendacion_id) REFERENCES reagendacion_finanzas(reagendacion_id) ON DELETE RESTRICT,
    FOREIGN KEY (pago_aplicacion_id) REFERENCES pago_aplicacion(id) ON DELETE RESTRICT,
    FOREIGN KEY (concepto_original_id) REFERENCES concepto_pago(id) ON DELETE RESTRICT,
    CHECK (importe > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `categoria_gasto` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE turno_caja
ADD COLUMN caja_abierta_id INT
GENERATED ALWAYS AS (
    CASE
        WHEN cierre IS NULL THEN caja_id
        ELSE NULL
    END
) STORED,

ADD COLUMN usuario_activo_id INT
GENERATED ALWAYS AS (
    CASE
        WHEN cierre IS NULL THEN usuario_id
        ELSE NULL
    END
) STORED,

ADD UNIQUE KEY uq_turno_activo_por_caja
    (caja_abierta_id),

ADD UNIQUE KEY uq_turno_activo_por_usuario
    (usuario_activo_id);

CREATE TABLE IF NOT EXISTS `gasto` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `area_servicio_id` INT NOT NULL,
  `categoria_gasto_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `turno_caja_id` INT,
  `metodo_pago_id` INT NOT NULL,
  `importe` DECIMAL(12,2) NOT NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `concepto` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`area_servicio_id`) REFERENCES `area_servicio`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`categoria_gasto_id`) REFERENCES `categoria_gasto`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`turno_caja_id`) REFERENCES `turno_caja`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`metodo_pago_id`) REFERENCES `metodo_pago`(`id`) ON DELETE RESTRICT,
  CHECK (importe > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `comprobante` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `operacion_id` INT NOT NULL,
  `folio` VARCHAR(60) NOT NULL,
  `tipo` ENUM('TICKET','RECIBO') NOT NULL,
  `emitido_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `archivo_url` VARCHAR(500),
  PRIMARY KEY (`id`),
  UNIQUE KEY (`folio`),
  FOREIGN KEY (`operacion_id`) REFERENCES `operacion`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- DATOS FIJOS DE CATALOGOS
INSERT IGNORE INTO `rol` (`nombre`, `descripcion`) VALUES ('Administrador','Administracion general'),('Cajero restaurante','Captura pedidos y cobros'),('Cajero rentas','Rentas y pagos'),('Cocina','Preparacion de pedidos'),('Mesero','Entrega de comandas'),('Limpieza','Inspecciones y limpieza'),('Aspirante','Sin permisos operativos');
INSERT IGNORE INTO `area_servicio` (`codigo`, `nombre`) VALUES ('RESTAURANTE','Restaurante'),('SALON','Salones'),('INFLABLE','Juegos inflables');
INSERT IGNORE INTO `tipo_producto` (`codigo`, `nombre`) VALUES ('PREPARADO','Platillo preparado'),('EMPAQUETADO','Producto empaquetado');
INSERT IGNORE INTO `tipo_ingrediente` (`codigo`, `nombre`) VALUES ('FIJO','Ingrediente fijo'),('REMOVIBLE','Ingrediente que puede quitarse'),('EXTRA','Porcion adicional con costo');
INSERT IGNORE INTO `unidad_medida` (`codigo`, `nombre`) VALUES ('g','Gramos'),('ml','Mililitros'),('pieza','Piezas');
INSERT IGNORE INTO `metodo_pago` (`codigo`, `nombre`) VALUES ('EFECTIVO','Efectivo'),('TARJETA','Tarjeta'),('TRANSFERENCIA','Transferencia');
INSERT IGNORE INTO `concepto_pago` (`codigo`, `nombre`) VALUES ('TOTAL','Pago de servicio'),('ANTICIPO','Anticipo'),('SALDO','Liquidacion'),('DEPOSITO_LIMPIEZA','Deposito reembolsable de limpieza');
INSERT IGNORE INTO `categoria_gasto` (`nombre`) VALUES ('Mantenimiento'),('Limpieza'),('Servicios'),('Otros');

-- VISTA: importe historico del pedido (base + extras + preferencias, por unidad)
CREATE OR REPLACE VIEW v_total_pedido AS
SELECT p.id AS pedido_id,
  COALESCE(SUM(d.cantidad * (d.precio_unitario + COALESCE(i.extra,0) + COALESCE(o.opciones,0))), 0) AS total
FROM pedido p
LEFT JOIN detalle_pedido d ON d.pedido_id = p.id
LEFT JOIN (
  SELECT detalle_pedido_id, SUM(CASE WHEN accion = 'EXTRA' THEN porciones * precio_extra_unitario ELSE 0 END) AS extra
  FROM detalle_pedido_ingrediente GROUP BY detalle_pedido_id
) i ON i.detalle_pedido_id = d.id
LEFT JOIN (
  SELECT detalle_pedido_id, SUM(ajuste_precio_unitario) AS opciones
  FROM detalle_pedido_opcion GROUP BY detalle_pedido_id
) o ON o.detalle_pedido_id = d.id
GROUP BY p.id;

-- VISTA: existencias por lote menos las cantidades reservadas
CREATE OR REPLACE VIEW v_existencia_lote AS
SELECT l.id AS lote_id, l.item_inventario_id, l.fecha_caducidad,
  COALESCE(m.movimiento,0) AS existencia_fisica,
  COALESCE(r.reservado,0) AS cantidad_reservada,
  COALESCE(m.movimiento,0) - COALESCE(r.reservado,0) AS disponible,
  CASE WHEN l.fecha_caducidad IS NOT NULL AND l.fecha_caducidad < CURRENT_DATE THEN 1 ELSE 0 END AS caducado
FROM lote_inventario l
LEFT JOIN (
  SELECT lote_inventario_id, SUM(CASE WHEN tipo IN ('ENTRADA','AJUSTE_POS','DEVOLUCION') THEN cantidad ELSE -cantidad END) AS movimiento
  FROM movimiento_inventario GROUP BY lote_inventario_id
) m ON m.lote_inventario_id = l.id
LEFT JOIN (
  SELECT lote_inventario_id, SUM(cantidad) AS reservado FROM reserva_inventario WHERE estado = 'RESERVADA' GROUP BY lote_inventario_id
) r ON r.lote_inventario_id = l.id;


