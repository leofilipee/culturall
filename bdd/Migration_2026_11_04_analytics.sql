-- ============================================================
-- Migration 2026-11-04 — Analytics (visualizações, cliques em bilhetes, favoritos, partilhas, calendário)
-- ============================================================
-- Idempotente: pode ser executada várias vezes. Equivale ao que a API aplica sozinha na primeira utilização
-- (api/[...route].js -> ensureSchema); executa-a manualmente se o utilizador da BD não tiver permissões de ALTER/CREATE
-- na Vercel. Requer MariaDB 10.0+/TiDB (ADD COLUMN IF NOT EXISTS).

-- 1) Colunas novas ------------------------------------------------
ALTER TABLE evento ADD COLUMN IF NOT EXISTS evpublicaem DATETIME NULL;
ALTER TABLE evento ADD COLUMN IF NOT EXISTS evdatapublicacao DATETIME NULL;
ALTER TABLE localizacao ADD COLUMN IF NOT EXISTS loclatitude DECIMAL(9,6) NULL;
ALTER TABLE localizacao ADD COLUMN IF NOT EXISTS loclongitude DECIMAL(9,6) NULL;
ALTER TABLE favorito ADD COLUMN IF NOT EXISTS favdata DATETIME NULL;
ALTER TABLE organizador ADD COLUMN IF NOT EXISTS orgtipo VARCHAR(30) NULL;
ALTER TABLE organizador ADD COLUMN IF NOT EXISTS orgconcelho VARCHAR(100) NULL;
ALTER TABLE organizador ADD COLUMN IF NOT EXISTS orgtembilheteira VARCHAR(10) NULL;
ALTER TABLE organizador ADD COLUMN IF NOT EXISTS orginteressebilheteira VARCHAR(10) NULL;

-- Links de bilhetes podem ser longos.
ALTER TABLE evento MODIFY COLUMN evlinkbilhete VARCHAR(2048) NULL;

-- 2) Estados e datas de publicação --------------------------------
-- 'ativo' e 'publicado' significavam o mesmo; passa a usar-se só 'publicado'.
UPDATE evento SET evestado = 'publicado' WHERE evestado = 'ativo';
UPDATE evento SET evdatapublicacao = COALESCE(evdataaprovacao, evdatasubmissao)
 WHERE evdatapublicacao IS NULL AND evestado = 'publicado';

-- 3) Tabela de factos ---------------------------------------------
CREATE TABLE IF NOT EXISTS eventointeracao (
    ideventointeracao BIGINT NOT NULL AUTO_INCREMENT,
    evitipo ENUM('visualizacao','clique_bilhete','favorito_add','favorito_remove','partilha','calendario') NOT NULL,
    eviidevento INT NOT NULL,
    eviidutilizador INT NULL,
    evisessao VARCHAR(64) NULL,
    evidatahora DATETIME NOT NULL,
    evidispositivo VARCHAR(10) NULL,
    eviorigem VARCHAR(30) NULL,
    eviidorganizador INT NULL,
    evicategoria VARCHAR(100) NULL,
    evidistrito VARCHAR(100) NULL,
    evipreco DECIMAL(10,2) NULL,
    evisimulado TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (ideventointeracao),
    KEY idx_evi_evento_tipo_data (eviidevento, evitipo, evidatahora),
    KEY idx_evi_data (evidatahora),
    KEY idx_evi_organizador_data (eviidorganizador, evidatahora),
    KEY idx_evi_sessao (evisessao, eviidevento, evitipo),
    KEY idx_evi_utilizador (eviidutilizador)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Histórico de visualizações antigas (executar uma só vez; a marca 'legacy-<id>' evita duplicados) ----
-- (A tabela eventovisualizacao vem de ScriptTabelas.sql / da migração de maio; deixa de ser usada.)
INSERT INTO eventointeracao (evitipo, eviidevento, eviidutilizador, evisessao, evidatahora, eviorigem, eviidorganizador, evicategoria, evidistrito, evipreco)
SELECT 'visualizacao', v.evvidevento, v.evvidutilizador, CONCAT('legacy-', v.ideventovisualizacao), v.evvdatahora, 'legado', e.evidorganizador, c.catnome, l.locdistrito, e.evvalor
  FROM eventovisualizacao v
  JOIN evento e ON e.idevento = v.evvidevento
  JOIN categoria c ON c.idcategoria = e.evidcategoria
  JOIN localizacao l ON l.idlocalizacao = e.evidlocalizacao
 WHERE NOT EXISTS (SELECT 1 FROM eventointeracao i WHERE i.evisessao = CONCAT('legacy-', v.ideventovisualizacao));

-- 5) Aprovação obrigatória de eventos (2026-11-06) -------------------------
-- Eventos criados antes desta regra e já visíveis/ocultos contam como aprovados. Os novos eventos dos organizadores
-- ficam 'pendente' até um administrador os aprovar. (Idempotente; o limite de data evita aprovar rascunhos novos.)
UPDATE evento SET evdataaprovacao = COALESCE(evdatapublicacao, evdatasubmissao)
 WHERE evdataaprovacao IS NULL AND evestado IN ('publicado','ativo','oculto','inativo')
   AND evdatasubmissao < '2026-11-07 00:00:00';

-- 6) Pedidos de alteração de eventos (2026-11-06) -----------------------------
-- Quando um organizador edita um evento já aprovado, a versão pública mantém-se e as alterações ficam aqui
-- até um administrador as aprovar. aldados = JSON com os campos validados e as imagens novas; almotivo preenchido
-- = alteração recusada (o organizador vê o motivo). Sem chave estrangeira (limpo explicitamente ao apagar eventos).
CREATE TABLE IF NOT EXISTS eventoalteracao (
    idalteracao INT NOT NULL AUTO_INCREMENT,
    alidevento INT NOT NULL,
    aldados LONGTEXT NOT NULL,
    aldata DATETIME NOT NULL,
    almotivo VARCHAR(300) NULL,
    PRIMARY KEY (idalteracao),
    UNIQUE KEY uq_al_evento (alidevento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
