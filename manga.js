const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose(); // Importe o pacote sqlite3
const app = express();
const cors = require('cors'); // Importe o pacote cors
const PORT = process.env.PORT || 4000;
const path = require('path');
const https = require('https');
const fs = require('fs');
const compression = require('compression');

app.use(compression());
app.use(bodyParser.json({ limit: '50mb' })); // Define o limite máximo para 50MB
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

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


// Rota para obter as informações de um mangá e seus capítulos
app.get('/mangas/:mangaid', (req, res) => {
    const { mangaid } = req.params;

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

        db.all(`SELECT * FROM capitulos_manga WHERE mangaid = ?`, [mangaid], (err, capitulos) => {
            if (err) {
                console.error('Erro ao obter dados de capitulos_manga:', err.message);
                res.status(500).send('Erro ao obter dados de capitulos_manga');
                return;
            }

            // Agrupar capítulos por `cap_numero`
            const capitulosAgrupados = capitulos.reduce((acc, capitulo) => {
                const { cap_numero, link } = capitulo;
                if (!acc[cap_numero]) {
                    acc[cap_numero] = { ...capitulo, links: [] };
                }
                acc[cap_numero].links.push(link);
                return acc;
            }, {});

            // Transformar objeto em array e concatenar links
            const capitulosComLinks = Object.values(capitulosAgrupados).map(capitulo => {
                capitulo.links = capitulo.links.join(', ');
                return capitulo;
            });

            const resultado = {
                ...manga,
                capitulos: capitulosComLinks
            };

            res.status(200).json(resultado);
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

            // Organizar capítulos por manga e criar uma string única para os links
            const mangaWithChapters = rows.map(manga => {
                // Filtrar capítulos do manga atual
                const mangaChapters = chapters.filter(chapter => chapter.mangaid === manga.mangaid);

                // Criar uma string única com URLs de capítulos separados por vírgulas
                const chapterLinks = mangaChapters
                    .map(chapter => chapter.link)
                    .join(', ');

                return {
                    ...manga,
                    capitulos: mangaChapters.map(chapter => ({
                        ...chapter,
                        // Adiciona a string única de links aos capítulos
                        links: chapterLinks
                    }))
                };
            });

            res.json(mangaWithChapters);
        });
    });
});

app.get('/mangas/page/:page', (req, res) => {
    const page = parseInt(req.params.page, 10);
    const limit = 30; // Número de mangas por página
    const offset = (page - 1) * limit; // Calcula o offset com base na página atual

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


// Rota para editar um mangá e seus capítulos
app.put('/mangas/:mangaid', (req, res) => {
    const { mangaid } = req.params;
    const { titulo, titulo_alternativo, autor, genero, sinopse, capa_url, data_postagem, data_lancamento, status, classificacao, tipo_midia, capitulos } = req.body;

    db.run(`UPDATE mangasinfo SET titulo = ?, titulo_alternativo = ?, autor = ?, genero = ?, sinopse = ?, capa_url = ?, data_postagem = ?, data_lancamento = ?, status = ?, classificacao = ?, tipo_midia = ? WHERE mangaid = ?`,
        [titulo, titulo_alternativo, autor, genero, sinopse, capa_url, data_postagem, data_lancamento, status, classificacao, tipo_midia, mangaid],
        function (err) {
            if (err) {
                console.error('Erro ao atualizar dados em mangasinfo:', err.message);
                res.status(500).send('Erro ao atualizar dados em mangasinfo');
            } else {
                const updateChapterPromises = capitulos.map(chapter => {
                    return new Promise((resolve, reject) => {
                        const { cap_numero, numero, titulo, link, data_postagem, data_lancamento } = chapter;
                        db.run(`UPDATE capitulos_manga SET cap_numero = ?, numero = ?, titulo = ?, link = ?, data_postagem = ?, data_lancamento = ? WHERE cap_numero = ? AND mangaid = ?`,
                            [cap_numero, numero, titulo, link, data_postagem, data_lancamento, cap_numero, mangaid],
                            function (err) {
                                if (err) {
                                    reject('Erro ao atualizar dados em capitulos_manga');
                                } else {
                                    resolve();
                                }
                            });
                    });
                });

                Promise.all(updateChapterPromises)
                    .then(() => res.status(200).send('Mangá e capítulos atualizados com sucesso'))
                    .catch(err => res.status(500).send(err));
            }
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

