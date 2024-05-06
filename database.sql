-- Criação da tabela "animes"
CREATE TABLE IF NOT EXISTS animes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capa TEXT,
    titulo TEXT NOT NULL,
    tituloAlternativo TEXT,
    selo TEXT,
    sinopse TEXT,
    classificacao TEXT,
    status TEXT,
    qntd_temporadas INTEGER,
    anoLancamento INTEGER,
    dataPostagem DATE,
    ovas TEXT,
    filmes TEXT,
    estudio TEXT,
    diretor TEXT,
    genero TEXT -- Adiciona a coluna de gênero diretamente à tabela animes
);


CREATE TABLE IF NOT EXISTS favoritos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    anime_id INTEGER,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (anime_id) REFERENCES animes(id)
);

-- Criação da tabela "episodios"
CREATE TABLE IF NOT EXISTS episodios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temporada INTEGER,
    numero INTEGER,
    nome TEXT,
    link TEXT,
    capa_ep TEXT,
    FOREIGN KEY (anime_id) REFERENCES animes(id)
);