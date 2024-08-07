const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose(); // Importe o pacote sqlite3
const app = express();
const cors = require('cors'); // Importe o pacote cors
const PORT = process.env.PORT || 4000;
const path = require('path');
const https = require('https');
const NodeCache = require('node-cache');
const fs = require('fs');
const compression = require('compression');

app.use(compression());
app.use(bodyParser.json({ limit: '50mb' })); // Define o limite máximo para 50MB
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
const cache = new NodeCache({ stdTTL: 600 }); // Cache por 10 minutos
const httpsOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/saikanet.online/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/saikanet.online/fullchain.pem')
};

// Caminho para o arquivo do banco de dados SQLite
// Cria uma nova conexão com o banco de dados SQLite
const dbPath = path.resolve(__dirname, 'database_mangas.db');

// Cria uma nova conexão com o banco de dados SQLite
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');

        // Cria a tabela mangasinfo se não existir
        db.run(`
            CREATE TABLE IF NOT EXISTS mangasinfo (
                mangaid INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                titulo_alternativo TEXT,
                autor TEXT,
                genero TEXT,
                sinopse TEXT,
                capa_url TEXT,
                data_postagem TEXT,
                data_lancamento TEXT,
                status TEXT,
                classificacao TEXT,
                tipo_midia TEXT
            )
        `, (err) => {
            if (err) {
                console.error('Erro ao criar tabela mangasinfo:', err.message);
            } else {
                console.log('Tabela mangasinfo criada ou já existe.');
            }
        });

        // Cria a tabela capitulos_manga se não existir
        db.run(`
            CREATE TABLE IF NOT EXISTS capitulos_manga (
                mangaid INTEGER,
                cap_numero INTEGER,
                numero INTEGER,
                titulo TEXT,
                link TEXT,
                data_postagem TEXT,
                data_lancamento TEXT,
                FOREIGN KEY (mangaid) REFERENCES mangasinfo (mangaid)
            )
        `, (err) => {
            if (err) {
                console.error('Erro ao criar tabela capitulos_manga:', err.message);
            } else {
                console.log('Tabela capitulos_manga criada ou já existe.');
            }
        });
    }
});

// Rota para inserir um novo mangá e seus capítulos
app.post('/mangas', (req, res) => {
    const { titulo, titulo_alternativo, autor, genero, sinopse, capa_url, data_postagem, data_lancamento, status, classificacao, tipo_midia, capitulos } = req.body;

    // Verificar se o manga já existe
    db.get('SELECT mangaid FROM mangasinfo WHERE titulo = ?', [titulo], (err, row) => {
        if (err) {
            console.error('Erro ao verificar existência do manga:', err.message);
            return res.status(500).send('Erro ao verificar existência do manga');
        }

        if (row) {
            // Mangá já existe
            return res.status(400).send('Mangá já existente');
        }

        // Inserir novo manga
        db.run(`INSERT INTO mangasinfo (titulo, titulo_alternativo, autor, genero, sinopse, capa_url, data_postagem, data_lancamento, status, classificacao, tipo_midia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [titulo, titulo_alternativo, autor, genero, sinopse, capa_url, data_postagem, data_lancamento, status, classificacao, tipo_midia],
            function (err) {
                if (err) {
                    console.error('Erro ao inserir dados em mangasinfo:', err.message);
                    return res.status(500).send('Erro ao inserir dados em mangasinfo');
                }

                const mangaid = this.lastID;
                const insertChapterPromises = capitulos.map(chapter => {
                    return new Promise((resolve, reject) => {
                        const { cap_numero, numero, titulo, link, data_postagem, data_lancamento } = chapter;
                        db.run(`INSERT INTO capitulos_manga (mangaid, cap_numero, numero, titulo, link, data_postagem, data_lancamento) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [mangaid, cap_numero, numero, titulo, link, data_postagem, data_lancamento],
                            function (err) {
                                if (err) {
                                    reject('Erro ao inserir dados em capitulos_manga');
                                } else {
                                    resolve();
                                }
                            });
                    });
                });

                Promise.all(insertChapterPromises)
                    .then(() => res.status(200).send('Mangá e capítulos inseridos com sucesso'))
                    .catch(err => res.status(500).send(err));
            });
    });
});

app.get('/mangas/:mangaid', (req, res) => {
    const { mangaid } = req.params;
    const { page = 1, limit = 10 } = req.query; // Parâmetros de página e limite, com valores padrão

    // Verifica se o resultado está em cache
    const cacheKey = `manga_${mangaid}_page_${page}_limit_${limit}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
        return res.status(200).json(cachedData);
    }

    db.get(`SELECT * FROM mangasinfo WHERE mangaid = ?`, [mangaid], (err, manga) => {
        if (err) {
            console.error('Erro ao obter dados de mangasinfo:', err.message);
            res.status(500).send('Erro ao obter dados de mangasinfo');
            return;
        }

        if (!manga) {
            res.status(404).send('Mangá não encontrado');
            return;
        }

        // Paginação dos capítulos
        const offset = (page - 1) * limit;

        // Ajuste da consulta SQL para ordenar por cap_numero e depois por numero
        db.all(`SELECT * FROM capitulos_manga WHERE mangaid = ? ORDER BY cap_numero ASC, numero ASC LIMIT ? OFFSET ?`, [mangaid, limit, offset], (err, capitulos) => {
            if (err) {
                console.error('Erro ao obter dados de capitulos_manga:', err.message);
                res.status(500).send('Erro ao obter dados de capitulos_manga');
                return;
            }

            // Obter o total de capítulos
            db.get(`SELECT COUNT(*) AS total FROM capitulos_manga WHERE mangaid = ?`, [mangaid], (err, countResult) => {
                if (err) {
                    console.error('Erro ao obter o total de capítulos:', err.message);
                    res.status(500).send('Erro ao obter o total de capítulos');
                    return;
                }

                const totalCapitulos = countResult.total;
                const totalPaginas = Math.ceil(totalCapitulos / limit); // Calcula o total de páginas

                // Prepare o resultado final
                const resultado = {
                    ...manga,
                    capitulos,
                    pagina: parseInt(page, 10),
                    limite: parseInt(limit, 10),
                    totalPaginas, // Adiciona o total de páginas na resposta
                    totalCapitulos // Adiciona o total de capítulos na resposta
                };

                // Valida o formato dos dados
                if (!resultado.capitulos || !Array.isArray(resultado.capitulos)) {
                    res.status(500).send('Dados de capítulos inválidos');
                    return;
                }

                // Armazena o resultado no cache
                cache.set(cacheKey, resultado);

                res.status(200).json(resultado);
            });
        });
    });
});



app.get('/search', (req, res) => {
    const searchQuery = req.query.query || '';

    if (searchQuery.trim() === '') {
        return res.status(400).send('O parâmetro de pesquisa não pode estar vazio.');
    }

    const searchMangasQuery = `
        SELECT * FROM mangasinfo
        WHERE titulo LIKE ? OR titulo_alternativo LIKE ?
        LIMIT 30
    `;

    db.all(searchMangasQuery, [`%${searchQuery}%`, `%${searchQuery}%`], (err, mangas) => {
        if (err) {
            console.error('Erro ao buscar mangas:', err.message);
            return res.status(500).send('Erro ao buscar mangas');
        }

        // Lista de mangas para buscar capítulos
        const mangaIds = mangas.map(manga => manga.mangaid);

        if (mangaIds.length === 0) {
            return res.status(200).json([]);
        }

        const searchCapitulosQuery = `
            SELECT * FROM capitulos_manga
            WHERE mangaid IN (${mangaIds.join(',')})
        `;

        db.all(searchCapitulosQuery, (err, capitulos) => {
            if (err) {
                console.error('Erro ao buscar capítulos:', err.message);
                return res.status(500).send('Erro ao buscar capítulos');
            }

            // Organiza os capítulos por mangaid
            const capitulosPorManga = capitulos.reduce((acc, capitulo) => {
                if (!acc[capitulo.mangaid]) {
                    acc[capitulo.mangaid] = [];
                }
                acc[capitulo.mangaid].push(capitulo);
                return acc;
            }, {});

            // Adiciona os capítulos aos mangas
            const resultado = mangas.map(manga => ({
                ...manga,
                capitulos: capitulosPorManga[manga.mangaid] || []
            }));

            res.status(200).json(resultado);
        });
    });
});

app.get('/recent-mangas', (req, res) => {
    // Consulta para pegar os 30 mangas mais recentes com base na data de postagem
    const query = `
        SELECT * FROM mangasinfo
        ORDER BY data_postagem DESC
        LIMIT 30
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar mangas recentes:', err.message);
            res.status(500).send('Erro ao buscar mangas recentes');
            return;
        }

        // Para cada manga, buscar também seus capítulos
        const mangaIds = rows.map(row => row.mangaid);

        if (mangaIds.length === 0) {
            return res.json([]);
        }

        const chaptersQuery = `
            SELECT * FROM capitulos_manga
            WHERE mangaid IN (${mangaIds.join(', ')})
        `;

        db.all(chaptersQuery, [], (err, chapters) => {
            if (err) {
                console.error('Erro ao buscar capítulos dos mangas:', err.message);
                res.status(500).send('Erro ao buscar capítulos dos mangas');
                return;
            }

            // Organizar capítulos por manga
            const mangaWithChapters = rows.map(manga => ({
                ...manga,
                capitulos: chapters.filter(chapter => chapter.mangaid === manga.mangaid)
            }));

            res.json(mangaWithChapters);
        });
    });
});
app.get('/mangas/page/:page', (req, res) => {
    const page = parseInt(req.params.page, 10);
    const limit = 150; // Número de mangas por página
    const offset = (page - 1) * limit; // Calcula o offset com base na página atual

    // Consulta para pegar o total de mangas
    const countQuery = 'SELECT COUNT(*) AS total FROM mangasinfo';
    db.get(countQuery, [], (err, countRow) => {
        if (err) {
            console.error('Erro ao contar mangas:', err.message);
            res.status(500).send('Erro ao contar mangas');
            return;
        }

        const totalMangas = countRow.total;
        const totalPages = Math.ceil(totalMangas / limit);

        // Consulta para pegar os mangas com base na página e limite, ordenados pelo mangaid em ordem crescente
        const query = `
            SELECT * FROM mangasinfo
            ORDER BY mangaid ASC
            LIMIT ? OFFSET ?
        `;

        db.all(query, [limit, offset], (err, rows) => {
            if (err) {
                console.error('Erro ao buscar mangas:', err.message);
                res.status(500).send('Erro ao buscar mangas');
                return;
            }

            // Para cada manga, buscar também seus capítulos
            const mangaIds = rows.map(row => row.mangaid);

            if (mangaIds.length === 0) {
                return res.json({ mangas: [], totalPages });
            }

            // Consulta para pegar os capítulos com base nos mangaids, ordenados pelo cap_numero em ordem crescente
            const chaptersQuery = `
                SELECT * FROM capitulos_manga
                WHERE mangaid IN (${mangaIds.join(', ')})
                ORDER BY mangaid, cap_numero ASC
            `;

            db.all(chaptersQuery, [], (err, chapters) => {
                if (err) {
                    console.error('Erro ao buscar capítulos dos mangas:', err.message);
                    res.status(500).send('Erro ao buscar capítulos dos mangas');
                    return;
                }

                // Organizar capítulos por manga
                const mangaWithChapters = rows.map(manga => ({
                    ...manga,
                    capitulos: chapters.filter(chapter => chapter.mangaid === manga.mangaid)
                }));

                res.json({ mangas: mangaWithChapters, totalPages });
            });
        });
    });
});
// Rota para editar um mangá e seus capítulos
app.put('/mangas/:mangaid', (req, res) => {
    const { mangaid } = req.params;
    const { titulo, titulo_alternativo, autor, genero, sinopse, capa_url, data_postagem, data_lancamento, status, classificacao, tipo_midia, capitulos } = req.body;

    db.run(`UPDATE mangasinfo SET titulo = ?, titulo_alternativo = ?, autor = ?, genero = ?, sinopse = ?, capa_url = ?, data_postagem = ?, data_lancamento = ?, status = ?, classificacao = ?, tipo_midia = ? WHERE mangaid = ?`,
        [titulo, titulo_alternativo, autor, genero, sinopse, capa_url, data_postagem, data_lancamento, status, classificacao, tipo_midia, mangaid],
        function (err) {
            if (err) {
                console.error('Erro ao atualizar dados em mangasinfo:', err.message);
                res.status(500).json({ message: 'Erro ao atualizar dados em mangasinfo' });
                return;
            }

            // Excluir capítulos existentes
            db.run(`DELETE FROM capitulos_manga WHERE mangaid = ?`, [mangaid], function (err) {
                if (err) {
                    console.error('Erro ao excluir capítulos antigos:', err.message);
                    res.status(500).json({ message: 'Erro ao excluir capítulos antigos' });
                    return;
                }

                // Inserir novos capítulos
                const insertChapterPromises = capitulos.map(chapter => {
                    return new Promise((resolve, reject) => {
                        const { cap_numero, numero, titulo, link, data_postagem, data_lancamento } = chapter;
                        db.run(`INSERT INTO capitulos_manga (cap_numero, numero, titulo, link, data_postagem, data_lancamento, mangaid) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [cap_numero, numero, titulo, link, data_postagem, data_lancamento, mangaid],
                            function (err) {
                                if (err) {
                                    reject('Erro ao inserir novo capítulo');
                                } else {
                                    resolve();
                                }
                            });
                    });
                });
                Promise.all(insertChapterPromises)
                    .then(() => {
                        // Invalida o cache para o mangaid
                        cache.del(`manga_${mangaid}_page_1_limit_10`);
                        cache.del(`manga_${mangaid}_capitulos`);
                        cache.del(`manga_${mangaid}`);

                        // Invalida caches de listagens
                        cache.del('mangas_list_page_1_limit_10');
                        cache.del(`mangas_genre_${genre}_page_1_limit_10`);
                        cache.del(`mangas_author_${author}_page_1_limit_10`);
                        // Adicione aqui a lógica para invalidar outros caches conforme necessário

                        res.status(200).json({ message: 'Mangá e capítulos atualizados com sucesso' });
                    })
                    .catch(err => res.status(500).json({ message: err }));
            });
        });
});


// Rota para excluir um mangá e seus capítulos
app.delete('/mangas/:mangaid', (req, res) => {
    const { mangaid } = req.params;

    // Inicia uma transação
    db.serialize(() => {
        // Remove todos os capítulos relacionados ao mangaid
        db.run(`DELETE FROM capitulos_manga WHERE mangaid = ?`, [mangaid], (err) => {
            if (err) {
                console.error('Erro ao deletar capítulos:', err.message);
                res.status(500).send('Erro ao deletar capítulos');
                return;
            }

            // Remove o mangaid da tabela mangasinfo
            db.run(`DELETE FROM mangasinfo WHERE mangaid = ?`, [mangaid], (err) => {
                if (err) {
                    console.error('Erro ao deletar manga:', err.message);
                    res.status(500).send('Erro ao deletar manga');
                    return;
                }

                res.status(200).send('Manga e dados associados foram excluídos com sucesso');
            });
        });
    });
});


https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
