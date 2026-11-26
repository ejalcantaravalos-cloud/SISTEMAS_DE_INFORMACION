|-----------------------------------------------------------|
    Consultas
|-----------------------------------------------------------|



|-----------------------------------------------------------|
CONSULTAS PARA EXPLICACION DE INFLABLES
|------------------------------------------------------------|
PARA HACER UNA CONSUTAL VIEJA

UPDATE reservacion_inflable
SET
    inicio = DATE_SUB(CURDATE(), INTERVAL 2 DAY),
    fin = DATE_SUB(CURDATE(), INTERVAL 1 DAY),
    estado = 'Reservada'
WHERE id = 3
  AND estado = 'Reservada';

PARA VER EL ESTADO DE LA RESERVACION

SELECT
    ri.id AS reservacion,
    ji.nombre AS inflable,
    ri.inicio,
    ri.fin,
    ri.estado,

    CASE
        WHEN ri.estado = 'Finalizada'
            THEN 'EVENTO FINALIZADO'

        WHEN ri.estado = 'Cancelada'
            THEN 'CANCELADA'

        WHEN ri.fin <= NOW()
            THEN 'PENDIENTE DE FINALIZAR'

        ELSE 'RESERVACION VIGENTE O FUTURA'
    END AS situacion

FROM reservacion_inflable ri

JOIN juegos_inflables ji
    ON ji.id = ri.inflable_id

ORDER BY ri.inicio DESC;



SELECT
    u.id,
    u.nombre,
    u.email,
    u.activo,
    r.nombre AS rol
FROM usuarios u
LEFT JOIN usuario_rol ur
    ON u.id = ur.usuario_id
LEFT JOIN rol r
    ON ur.rol_id = r.id;


    SELECT id, nombre
FROM rol;


SELECT
    c.id AS caja_id,
    c.nombre AS caja,
    c.activo,
    t.id AS turno_id,
    t.usuario_id,
    t.apertura
FROM caja c
LEFT JOIN turno_caja t
    ON t.caja_id = c.id
    AND t.cierre IS NULL
ORDER BY c.id;



SELECT
    p.id,
    p.importe,
    mp.nombre AS metodo_pago,
    p.turno_caja_id,
    p.fecha
FROM pago p
JOIN metodo_pago mp
    ON mp.id = p.metodo_pago_id
ORDER BY p.id DESC;



SELECT
    id,
    inicio,
    fin,
    estado,
    NOW() AS fecha_actual
FROM reservacion_inflable
WHERE id = 52;


-- Comprobar cajas con varios turnos abiertos
SELECT caja_id, COUNT(*) AS turnos_abiertos
FROM turno_caja
WHERE cierre IS NULL
GROUP BY caja_id
HAVING COUNT(*) > 1;

-- Comprobar cajeros con varias cajas abiertas
SELECT usuario_id, COUNT(*) AS turnos_abiertos
FROM turno_caja
WHERE cierre IS NULL
GROUP BY usuario_id
HAVING COUNT(*) > 1;

SELECT * FROM caja;

SELECT * FROM v_estado_cajas;

SELECT * FROM v_resumen_turno_caja;

SELECT * FROM v_historial_cortes;

SELECT *
FROM v_historial_cortes
WHERE turno_caja_id = 105;

DESCRIBE salones;
DESCRIBE imagen_salon;  

SELECT
    turno_caja_id,
    caja_id,
    usuario_id,
    fondo_inicial,
    pagos_efectivo,
    pagos_tarjeta,
    pagos_transferencia,
    total_cobrado,
    efectivo_esperado
FROM v_resumen_turno_caja
WHERE cierre IS NULL;

SELECT
    NOW() AS hora_mysql,
    UTC_TIMESTAMP() AS hora_utc,
    @@global.time_zone AS zona_global,
    @@session.time_zone AS zona_sesion;

    const fecha = v => v ? (v instanceof Date ? v.toLocaleString('es-MX') : String(v)) : '—';

git add .
git commit -m "Sprint 6: Reservaciones, cancelaciones y reagendaciones"
git push
|-----------------------------------------------------------|
    Inserts 
|-----------------------------------------------------------|

hacer el usuario existente ADMIN

UPDATE usuario_rol ur
JOIN usuarios u
    ON ur.usuario_id = u.id
JOIN rol r_actual
    ON ur.rol_id = r_actual.id
JOIN rol r_nuevo
    ON r_nuevo.nombre = 'Administrador'
SET ur.rol_id = r_nuevo.id
WHERE u.email = 'coso@gmail.com'
  AND r_actual.nombre = 'Aspirante';

  INSERT INTO caja (nombre, activo)
VALUES ('Caja de rentas', 1);


INSERT IGNORE INTO caja (nombre, activo)
VALUES
    ('Caja 01', 1),
    ('Caja 02', 1),
    ('Caja 03', 1);


