-- Migration incremental para bases já existentes
-- Executar após ScriptTabelas.sql em instalações antigas

ALTER TABLE utilizador
    ADD COLUMN IF NOT EXISTS utlocalizacao VARCHAR(120) NULL;

CREATE TABLE IF NOT EXISTS eventovisualizacao (
    ideventovisualizacao INT NOT NULL AUTO_INCREMENT,
    evvidevento INT NOT NULL,
    evvidutilizador INT NULL,
    evvdatahora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ideventovisualizacao),
    KEY idx_eventovisualizacao_evento (evvidevento),
    KEY idx_eventovisualizacao_utilizador (evvidutilizador),
    CONSTRAINT fk_evv_ev FOREIGN KEY (evvidevento) REFERENCES evento(idevento)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_evv_ut FOREIGN KEY (evvidutilizador) REFERENCES utilizador(idutilizador)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE imagem
    MODIFY COLUMN imgurl LONGTEXT NOT NULL;

ALTER TABLE evento
    MODIFY COLUMN evestado ENUM('pendente', 'ativo', 'inativo', 'publicado', 'oculto', 'recusado') NOT NULL DEFAULT 'pendente';
