ALTER TABLE paquetes

    ADD COLUMN porciones_incluidas INT
        NOT NULL DEFAULT 0,

    ADD COLUMN precio_porcion_extra DECIMAL(12,2)
        NOT NULL DEFAULT 0,

    ADD COLUMN manteles_incluidos INT
        NOT NULL DEFAULT 0,

    ADD CONSTRAINT chk_paquetes_porciones
        CHECK (porciones_incluidas >= 0),

    ADD CONSTRAINT chk_paquetes_precio_porcion
        CHECK (precio_porcion_extra >= 0),

    ADD CONSTRAINT chk_paquetes_manteles
        CHECK (manteles_incluidos >= 0);



------------------------------------------------------

        ALTER TABLE paquetes
    ADD COLUMN valor_porcion_incluida DECIMAL(12,2)
        NOT NULL DEFAULT 0,
    ADD CONSTRAINT chk_paquetes_valor_porcion
        CHECK (valor_porcion_incluida >= 0);