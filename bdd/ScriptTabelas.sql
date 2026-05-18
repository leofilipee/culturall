-- ============================================================
-- Cultur'All — Ficheiro 1: Criação da Base de Dados
-- ============================================================

-- DROP DATABASE IF EXISTS culturall;
-- CREATE DATABASE culturall CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE culturall;

-- ------------------------------------------------------------
-- Tabela: tipoutilizador
-- ------------------------------------------------------------
CREATE TABLE tipoutilizador (
    idtipoutilizador INT NOT NULL AUTO_INCREMENT,
    tutipo ENUM('anonimo', 'registado', 'organizador', 'administrador') NOT NULL,
    PRIMARY KEY (idtipoutilizador),
    UNIQUE KEY uq_tipoutilizador_tipo (tutipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabela: utilizador
-- ------------------------------------------------------------
CREATE TABLE utilizador (
    idutilizador INT NOT NULL AUTO_INCREMENT,
    utnome VARCHAR(120) NOT NULL,
    utemail VARCHAR(255) NOT NULL UNIQUE,
    utpasswordhash VARCHAR(255) NOT NULL,
    utinicio DATE NOT NULL,
    utcriadoem DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    utestado ENUM('ativo', 'inativo') NOT NULL DEFAULT 'ativo',
    utlocalizacao VARCHAR(120),
    uttipo INT NOT NULL,
    utfotoperfil LONGBLOB,
    PRIMARY KEY (idutilizador),
    KEY idx_utilizador_email (utemail),
    KEY idx_utilizador_tipo (uttipo),
    CONSTRAINT fk_ut_tipo FOREIGN KEY (uttipo) REFERENCES tipoutilizador(idtipoutilizador)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabela: administrador
-- ------------------------------------------------------------
CREATE TABLE administrador (
    idadministrador INT NOT NULL AUTO_INCREMENT,
    adidutilizador INT NOT NULL UNIQUE,
    adcriadoem DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idadministrador),
    CONSTRAINT fk_adm_ut FOREIGN KEY (adidutilizador) REFERENCES utilizador(idutilizador)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabela: organizador
-- ------------------------------------------------------------
CREATE TABLE organizador (
    idorganizador INT NOT NULL AUTO_INCREMENT,
    orgnome VARCHAR(120) NOT NULL,
    orgemail VARCHAR(255) NOT NULL UNIQUE,
    orgdescricao VARCHAR(500),
    orgwebsite VARCHAR(255),
    orginicio DATE,
    orgestado ENUM('pendente', 'aprovado', 'suspenso') NOT NULL DEFAULT 'pendente',
    orgidutilizador INT NOT NULL UNIQUE,
    otgfotoperfil LONGBLOB,
    PRIMARY KEY (idorganizador),
    KEY idx_organizador_email (orgemail),
    KEY idx_organizador_utilizador (orgidutilizador),
    CONSTRAINT fk_org_ut FOREIGN KEY (orgidutilizador) REFERENCES utilizador(idutilizador)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabela: categoria
-- ------------------------------------------------------------
CREATE TABLE categoria (
    idcategoria INT NOT NULL AUTO_INCREMENT,
    catnome VARCHAR(100) NOT NULL,
    PRIMARY KEY (idcategoria),
    UNIQUE KEY uq_categoria_nome (catnome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabela: localizacao
-- ------------------------------------------------------------
CREATE TABLE localizacao (
    idlocalizacao INT NOT NULL AUTO_INCREMENT,
    locmorada VARCHAR(150),
    loccidade VARCHAR(100) NOT NULL,
    locdistrito VARCHAR(100) NOT NULL,
    PRIMARY KEY (idlocalizacao),
    KEY idx_localizacao_distrito (locdistrito),
    KEY idx_localizacao_cidade (loccidade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabela: evento
-- ------------------------------------------------------------
CREATE TABLE evento (
    idevento INT NOT NULL AUTO_INCREMENT,
    evtitulo VARCHAR(150) NOT NULL,
    evdescricao VARCHAR(1000),
    evdatainicio DATETIME NOT NULL,
    evdatafim DATETIME,
    evvalor DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    evlinkbilhete VARCHAR(255),
    evestado ENUM('pendente', 'ativo', 'inativo', 'publicado', 'oculto', 'recusado') NOT NULL DEFAULT 'pendente',
    evdatasubmissao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    evdataaprovacao DATETIME,
    evmotivorecusa VARCHAR(300),
    evrecorrente TINYINT(1) NOT NULL DEFAULT 0,
    evperiodicidade ENUM('semanal', 'quinzenal', 'mensal'),
    evdiasrecorrencia VARCHAR(100),
    evidcategoria INT NOT NULL,
    evidlocalizacao INT NOT NULL,
    evidorganizador INT NOT NULL,
    evidadministradoraprovador INT,
    PRIMARY KEY (idevento),
    KEY idx_evento_estado (evestado),
    KEY idx_evento_data_inicio (evdatainicio),
    KEY idx_evento_categoria (evidcategoria),
    KEY idx_evento_localizacao (evidlocalizacao),
    KEY idx_evento_organizador (evidorganizador),
    CONSTRAINT fk_ev_cat FOREIGN KEY (evidcategoria) REFERENCES categoria(idcategoria)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_ev_loc FOREIGN KEY (evidlocalizacao) REFERENCES localizacao(idlocalizacao)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_ev_org FOREIGN KEY (evidorganizador) REFERENCES organizador(idorganizador)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_ev_adm FOREIGN KEY (evidadministradoraprovador) REFERENCES administrador(idadministrador)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabela: eventovisualizacao
-- ------------------------------------------------------------
CREATE TABLE eventovisualizacao (
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

-- ------------------------------------------------------------
-- Tabela: imagem
-- ------------------------------------------------------------
CREATE TABLE imagem (
    idimagem INT NOT NULL AUTO_INCREMENT,
    imglegenda VARCHAR(300),
    imgurl LONGTEXT NOT NULL,
    imgtipo ENUM('capa', 'galeria') NOT NULL DEFAULT 'galeria',
    imgidevento INT NOT NULL,
    PRIMARY KEY (idimagem),
    KEY idx_imagem_evento (imgidevento),
    CONSTRAINT fk_img_ev FOREIGN KEY (imgidevento) REFERENCES evento(idevento)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabela: favorito
-- ------------------------------------------------------------
CREATE TABLE favorito (
    idfavorito INT NOT NULL AUTO_INCREMENT,
    favidutilizador INT NOT NULL,
    favidevento INT NOT NULL,
    PRIMARY KEY (idfavorito),
    UNIQUE KEY uq_fav (favidutilizador, favidevento),
    KEY idx_favorito_utilizador (favidutilizador),
    KEY idx_favorito_evento (favidevento),
    CONSTRAINT fk_fav_ut FOREIGN KEY (favidutilizador) REFERENCES utilizador(idutilizador)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_fav_ev FOREIGN KEY (favidevento) REFERENCES evento(idevento)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabela: preferencia
-- ------------------------------------------------------------
CREATE TABLE preferencia (
    idpreferencia INT NOT NULL AUTO_INCREMENT,
    prefidutilizador INT NOT NULL,
    prefidcategoria INT NOT NULL,
    PRIMARY KEY (idpreferencia),
    UNIQUE KEY uq_pref (prefidutilizador, prefidcategoria),
    KEY idx_preferencia_utilizador (prefidutilizador),
    KEY idx_preferencia_categoria (prefidcategoria),
    CONSTRAINT fk_pref_ut FOREIGN KEY (prefidutilizador) REFERENCES utilizador(idutilizador)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_pref_cat FOREIGN KEY (prefidcategoria) REFERENCES categoria(idcategoria)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabela: notificacao
-- ------------------------------------------------------------
CREATE TABLE notificacao (
    idnotificacao INT NOT NULL AUTO_INCREMENT,
    notidutilizador INT NOT NULL,
    notidevento INT NOT NULL,
    notmensagem VARCHAR(200),
    notdata DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idnotificacao),
    KEY idx_notificacao_utilizador (notidutilizador),
    KEY idx_notificacao_evento (notidevento),
    CONSTRAINT fk_not_ut FOREIGN KEY (notidutilizador) REFERENCES utilizador(idutilizador)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_not_ev FOREIGN KEY (notidevento) REFERENCES evento(idevento)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
