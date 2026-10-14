-- ============================================================
-- Cultur'All — Ficheiro 2: Seed Data (Corrigido)
-- ============================================================

-- 1. Inserir Tipos de Utilizador (Garante que não falha se já existirem)
INSERT IGNORE INTO tipoutilizador (idtipoutilizador, tutipo) VALUES
(1, 'anonimo'),
(2, 'registado'),
(3, 'organizador'),
(4, 'administrador');

-- 2. Inserir Utilizadores
INSERT IGNORE INTO utilizador (utnome, utemail, utpasswordhash, utinicio, uttipo, utestado) VALUES
('Maria Silva', 'maria@example.com', '$2y$12$QfU4kGiGAspHsteZoRWGz.n24MJsx4/4GytkytV8CHHw2fjS52RgO', '2025-01-15', 2, 'ativo'),
('João Almeida', 'joao@example.com', '$2y$12$99Svclmc56dO240khow/CO3tIskXqmUMZQ6esAeiop02HgvC97g.C', '2024-11-05', 3, 'ativo'),
('Admin Cultur\'All', 'admin@culturall.pt', '$2y$12$9RNN8i.ELMwgwCpxRwSKHes9lSvjFhl05BccHwH0ikPJ82lTxv40u', '2024-10-01', 4, 'ativo'),
('Ana Costa', 'ana@example.com', '$2y$12$QfU4kGiGAspHsteZoRWGz.n24MJsx4/4GytkytV8CHHw2fjS52RgO', '2025-02-20', 2, 'ativo'),
('Pedro Oliveira', 'pedro@example.com', '$2y$12$QfU4kGiGAspHsteZoRWGz.n24MJsx4/4GytkytV8CHHw2fjS52RgO', '2025-01-10', 2, 'inativo'),
('Sofia Ferreira', 'sofia@example.com', '$2y$12$99Svclmc56dO240khow/CO3tIskXqmUMZQ6esAeiop02HgvC97g.C', '2026-03-01', 3, 'ativo'),
('Carlos Mendes', 'carlos@example.com', '$2y$12$99Svclmc56dO240khow/CO3tIskXqmUMZQ6esAeiop02HgvC97g.C', '2025-01-20', 3, 'ativo'),
('Rita Alves', 'rita@example.com', '$2y$12$99Svclmc56dO240khow/CO3tIskXqmUMZQ6esAeiop02HgvC97g.C', '2024-12-10', 3, 'inativo'),
('Admin Cultural', 'admin@cultural.pt', '$2y$12$9RNN8i.ELMwgwCpxRwSKHes9lSvjFhl05BccHwH0ikPJ82lTxv40u', '2026-05-14', 4, 'ativo');

-- 3. Inserir Administradores (Relacionando com a tabela utilizador)
INSERT IGNORE INTO administrador (adidutilizador)
SELECT idutilizador FROM utilizador WHERE utemail IN ('admin@culturall.pt', 'admin@cultural.pt');

-- 4. Inserir Organizadores
INSERT IGNORE INTO organizador (orgnome, orgemail, orgdescricao, orgwebsite, orginicio, orgestado, orgidutilizador) VALUES
('João Almeida', 'joao@example.com', 'Organizador de concertos e eventos culturais.', 'https://joaoalmeida.pt', '2024-11-05', 'aprovado', (SELECT idutilizador FROM utilizador WHERE utemail = 'joao@example.com')),
('Carlos Mendes', 'carlos@example.com', 'Promotor de experiências gastronómicas e festivais.', 'https://carlosmendes.pt', '2025-01-20', 'aprovado', (SELECT idutilizador FROM utilizador WHERE utemail = 'carlos@example.com')),
('Rita Alves', 'rita@example.com', 'Curadora de exposições e arte contemporânea.', 'https://ritaalves.pt', '2024-12-10', 'suspenso', (SELECT idutilizador FROM utilizador WHERE utemail = 'rita@example.com')),
('Sofia Ferreira', 'sofia@example.com', 'Organização de eventos familiares e educativos.', 'https://sofiaferreira.pt', '2026-03-01', 'aprovado', (SELECT idutilizador FROM utilizador WHERE utemail = 'sofia@example.com'));

-- 5. Inserir Categorias
INSERT IGNORE INTO categoria (catnome) VALUES
('Arte e Exposições'), ('Bem Estar'), ('Cinema'), ('Comédia'), ('Concertos'), 
('Dança'), ('Festivais'), ('Gastronomia'), ('Literatura'), ('Mercados e Feiras'), 
('Moda'), ('Outros'), ('Família'), ('Teatro');

-- 6. Inserir Localizações
INSERT IGNORE INTO localizacao (locmorada, loccidade, locdistrito) VALUES
('Centro Cultural de Belém', 'Lisboa', 'Lisboa'),
('Teatro Nacional D. Maria II', 'Lisboa', 'Lisboa'),
('Museu Berardo', 'Lisboa', 'Lisboa'),
('Casa da Música', 'Porto', 'Porto'),
('Parque da Cidade', 'Porto', 'Porto'),
('Évora Centro Histórico', 'Évora', 'Évora'),
('Jardim da Estrela', 'Lisboa', 'Lisboa'),
('Hot Clube de Portugal', 'Porto', 'Porto'),
('MEO Arena', 'Lisboa', 'Lisboa'),
('Alfama', 'Lisboa', 'Lisboa'),
('FIL', 'Lisboa', 'Lisboa'),
('Costa da Caparica', 'Costa da Caparica', 'Setúbal');