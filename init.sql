USE UG;
-- =================================================================
-- ARCHIVO SQL: Esquema para Sprint 1 (Empleados, Menús y Cocina)
-- =================================================================

-- Tabla de Usuarios (Personal interno: Admin, Cajero, Cocina, Mesero, etc.)
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(50) NOT NULL DEFAULT 'Aspirante', 
  activo BOOLEAN DEFAULT TRUE,               
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Categorías (Bloques de menús: Fijo, San Valentín, Halloween, etc.)
CREATE TABLE IF NOT EXISTS categoria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT NULL
);

-- Tabla de Productos / Platillos (HU-01: Alta, baja y menús especiales)
CREATE TABLE IF NOT EXISTS producto (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL, 
    stock INT DEFAULT 0,
    categoria_id INT,
    FOREIGN KEY (categoria_id) REFERENCES categoria(id) ON DELETE SET NULL,
    imagen_url VARCHAR(255),
    activo BOOLEAN DEFAULT TRUE,       
    favorito BOOLEAN DEFAULT FALSE,
    venta INT DEFAULT 0,
    especial BOOLEAN DEFAULT FALSE     
);

-- Grupos de Opciones (Personalización: "Elige tu término", "Ingredientes extra")
CREATE TABLE IF NOT EXISTS grupo_Preferencia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo_seleccion ENUM('UNICO', 'MULTIPLE') NOT NULL DEFAULT 'UNICO',
    requerido BOOLEAN NOT NULL DEFAULT FALSE
);

--  Opciones individuales (Ej: "Término medio", "Sin cebolla", "Queso extra")
CREATE TABLE IF NOT EXISTS Preferencia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grupo_Preferencia_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    ajuste_precio DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    FOREIGN KEY (grupo_Preferencia_id) REFERENCES grupo_Preferencia(id) ON DELETE CASCADE
);

-- 6. Relación de productos con sus grupos de opciones
CREATE TABLE IF NOT EXISTS producto_grupo_Preferencia (
    producto_id INT NOT NULL,
    grupo_Preferencia_id INT NOT NULL,
    PRIMARY KEY (producto_id, grupo_Preferencia_id),
    FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE CASCADE,
    FOREIGN KEY (grupo_Preferencia_id) REFERENCES grupo_Preferencia(id) ON DELETE CASCADE
);

--  Carrito temporal (Para armar la comanda en caja)
CREATE TABLE IF NOT EXISTS carrito (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,            -- Trabajador que está armando la orden
    producto_id INT NOT NULL,           
    cantidad INT NOT NULL DEFAULT 1,
    nota_cocina TEXT NULL,              
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE CASCADE
);

-- 8. Opciones seleccionadas en el carrito
CREATE TABLE IF NOT EXISTS carrito_opcion (
    carrito_id INT NOT NULL,
    opcion_id INT NOT NULL,      
    PRIMARY KEY (carrito_id, opcion_id),
    FOREIGN KEY (carrito_id) REFERENCES carrito(id) ON DELETE CASCADE,
    FOREIGN KEY (opcion_id) REFERENCES Preferencia(id) ON DELETE CASCADE
);

-- 9. Pedidos / Comandas definitivas para la cocina
CREATE TABLE IF NOT EXISTS pedido (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT,                     -- Cajero que registró el pedido
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id),
    tipo_orden ENUM('Mesa', 'Para llevar') NOT NULL DEFAULT 'Mesa',
    numero_mesa INT NULL,
    nombre_cliente VARCHAR(255) NULL,   -- Referencia para identificar la mesa o paquete
    total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    nota TEXT,
    estado ENUM('Recibido', 'En preparación', 'Listo para recoger', 'Entregado', 'Cancelado') NOT NULL DEFAULT 'Recibido',
    fecha_pedido DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_pedido (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT NOT NULL,
    producto_id INT NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (pedido_id) REFERENCES pedido(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES producto(id)
);