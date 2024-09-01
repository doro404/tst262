const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose(); // Importe o pacote sqlite3
const jwt = require('jsonwebtoken');
const app = express();
const cors = require('cors'); // Importe o pacote cors
const PORT = process.env.PORT || 3000;
const path = require('path');
const https = require('https');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { Builder } = require('xml2js');
const config = require('./config');
const { vpsUrl } = require('./config');
const compression = require('compression');
const cron = require('node-cron');

app.use(compression());
app.use(bodyParser.json({ limit: '50mb' })); // Define o limite máximo para 50MB
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
const allowedDomains = ['https://animesonlinebr.fun', 'https://animeshiru.site']; // Permite animesonlinebr.fun e animeshiru.site

app.use(cors({
    origin: function (origin, callback) {
        console.log('Origem:', origin);
        if (origin && allowedDomains.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Não permitido por CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

const httpsOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/saikanet.online/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/saikanet.online/fullchain.pem')
};

// Caminho para o arquivo do banco de dados SQLite
const dbPath = path.resolve(__dirname, 'database.db');

// Cria uma nova conexão com o banco de dados SQLite
const db = new sqlite3.Database(dbPath);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/imagens/perfil'); // Diretório onde os arquivos serão armazenados
    },
    filename: function (req, file, cb) {
        const userId = req.body.fotoPerfil || 'unknown'; // Se userId não estiver presente, use 'unknown'
        const fileExtension = '.jpg'; // Alterando a extensão para jpg
        const uniqueSuffix = uuidv4(); // Gera um identificador único
        const fileName = `usuario-${userId}-${uniqueSuffix}${fileExtension}`; // Nome do arquivo com sufixo único e extensão jpg
        cb(null, fileName); // Nome do arquivo
    }
});

const upload = multer({ storage: storage });

db.serialize(() => {
    // Criação da tabela "animes"
   db.run('CREATE TABLE IF NOT EXISTS animes (id INTEGER PRIMARY KEY AUTOINCREMENT, capa TEXT, titulo TEXT NOT NULL, tituloAlternativo TEXT, selo TEXT, sinopse TEXT, classificacao TEXT, status TEXT, qntd_temporadas INTEGER, anoLancamento INTEGER, dataPostagem DATE, ovas TEXT, filmes TEXT, estudio TEXT, diretor TEXT, genero TEXT, tipoMidia TEXT, visualizacoes INTEGER DEFAULT 0)');

  
    // Criação da tabela "episodios"
    db.run('CREATE TABLE IF NOT EXISTS episodios (id INTEGER PRIMARY KEY AUTOINCREMENT, temporada INTEGER, numero INTEGER, nome TEXT, link TEXT, capa_ep TEXT, anime_id INTEGER, FOREIGN KEY (anime_id) REFERENCES animes(id))');

    // Criação da tabela "usuarios"
    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            imagem_perfil TEXT
        )
    `);

    db.run('CREATE TABLE IF NOT EXISTS progresso_animes (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, anime_id INTEGER, episodio_assistido INTEGER, FOREIGN KEY (usuario_id) REFERENCES usuarios(id), FOREIGN KEY (anime_id) REFERENCES animes(id))');
    // Criação da tabela "admin"
    db.run('CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL, senha TEXT NOT NULL)');

    db.run('CREATE TABLE IF NOT EXISTS links (id INTEGER PRIMARY KEY AUTOINCREMENT, idTemporario TEXT, linkVideo TEXT, dataExpiracao INTEGER)');
}); /// criar as tabela necessarias caso nao exista ainda

app.use('/uploads/imagens/perfil', express.static(path.join(__dirname, 'uploads/imagens/perfil')));

app.get('/categorias', (req, res) => {
    // Verifica se o parâmetro "categorias" foi fornecido na consulta
    if (!req.query.categorias) {
        return res.status(400).json({ error: 'Parâmetro "categorias" não fornecido na consulta' });
    }
    
    // Divide a string de categorias solicitadas em um array
    const categoriasSolicitadas = req.query.categorias.split(',');
    console.log('Categorias solicitadas:', categoriasSolicitadas);

    // Cria um objeto para armazenar a contagem de animes para cada categoria solicitada
    const categoriasResponse = {};

    // Executa a consulta SQL para obter todos os animes
    db.all('SELECT genero FROM animes', (err, rows) => {
        if (err) {
            // Se houver um erro na consulta SQL, retorna uma mensagem de erro
            console.error('Erro na consulta SQL:', err.message);
            return res.status(500).json({ error: 'Erro ao executar a consulta SQL' });
        } else {
            // Para cada linha da consulta, verifica se cada categoria solicitada está presente
            rows.forEach(row => {
                const generos = row.genero.split(',');
                generos.forEach(genero => {
                    if (categoriasSolicitadas.includes(genero.trim())) {
                        categoriasResponse[genero.trim()] = (categoriasResponse[genero.trim()] || 0) + 1;
                    }
                });
            });

            // Retorna a resposta contendo a contagem de animes para cada categoria solicitada
            return res.json(categoriasResponse);
        }
    });
}); /// Rota para obter a quantidade de categorias e animes em cada categoria


app.post('/upload', upload.single('fotoPerfil'), (req, res) => {
    console.log('Conteúdo do corpo da solicitação:', req.body); // Adicione esta linha
    const userId = req.body.fotoPerfil; // ID do usuário enviado no corpo da solicitação

    // Verifica se o ID do usuário é válido (opcional)
    if (!userId) {
        return res.status(400).json({ error: 'ID do usuário não fornecido' });
    }

    // Verifica se o ID do usuário é válido consultando o banco de dados (opcional)
    db.get('SELECT * FROM usuarios WHERE id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Erro ao consultar o banco de dados:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }
        if (!user) {
            console.log('Usuário não encontrado com o ID:', userId);
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        // Log para verificar se o usuário foi encontrado no banco de dados
        console.log('Usuário encontrado:', user);

        // Renomeia o arquivo da imagem de perfil com o ID do usuário
        const oldPath = req.file.path;
        const newPath = path.join(path.dirname(oldPath), `usuario-${userId}${path.extname(oldPath)}`);
        fs.renameSync(oldPath, newPath);

        // Atualiza o banco de dados com o caminho da imagem de perfil
        const imagePath = newPath.replace(/\\/g, '/'); // Substitui '\' por '/' para evitar problemas com caminhos de arquivo no Windows
        db.run('UPDATE usuarios SET imagem_perfil = ? WHERE id = ?', [imagePath, userId], (err) => {
            if (err) {
                console.error('Erro ao atualizar o banco de dados:', err);
                return res.status(500).json({ error: 'Erro ao salvar imagem de perfil' });
            }

            res.status(200).json({ message: 'Imagem de perfil enviada e associada com sucesso' });
        });
    });
}); /// rpta pra realizar envio da foto de perfil do usuario ja cadastrado

app.get('/obter-imagem-de-perfil/:userId', (req, res) => {
    const userId = req.params.userId;
  
    // Consulte o banco de dados para obter o caminho da imagem de perfil do usuário
    db.get('SELECT imagem_perfil FROM usuarios WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Erro ao consultar o banco de dados:', err);
        return res.status(500).json({ error: 'Erro ao consultar o banco de dados' });
      }
      
      let imageUrl;
      if (user && user.imagem_perfil) {
          // Se o usuário tiver uma imagem de perfil, retorne o URL dessa imagem
          imageUrl = user.imagem_perfil;
      } else {
          // Se o usuário não tiver uma imagem de perfil, retorne o URL da imagem padrão
          imageUrl = 'uploads/imagens/perfil/padrao.jpg'; // Substitua com o caminho correto da sua imagem padrão
      }

      const vpsUrl = config.vpsUrl;

      const fullUrl = `${vpsUrl}/${imageUrl}`;
  
      // Retorna o URL da imagem como resposta
      res.json({ url: fullUrl });
    });
});  /// rota pra obter o link de perfil do usuario pelo ID

app.get('/download', (req, res) => {
    try {
        // Caminho do arquivo a ser baixado
        const filePath = './database.db';

        // Verificar se o arquivo existe
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('O arquivo não existe.');
        }

        // Enviar o arquivo como resposta para download
        res.download(filePath, 'database.db', (err) => {
            if (err) {
                console.error('Erro ao enviar arquivo para download:', err);
                res.status(500).send('Erro ao baixar o arquivo.');
            } else {
                console.log('Arquivo enviado para download com sucesso.');
            }
        });
    } catch (error) {
        console.error('Erro ao processar a solicitação de download:', error);
        res.status(500).send('Erro ao processar a solicitação de download.');
    }
}); /// rota pra baixar o banco de dados pelo navegador

app.delete('/usuarios', (req, res) => {
    // Consulta SQL para limpar todas as credenciais de usuários
    db.run('DELETE FROM usuarios', (err) => {
        if (err) {
            console.error('Erro ao limpar todas as credenciais de usuários:', err);
            return res.status(500).json({ error: 'Erro ao limpar todas as credenciais de usuários' });
        }

        // Consulta SQL para recriar a tabela usuários, reiniciando a sequência
        db.run('DROP TABLE IF EXISTS usuarios', (err) => {
            if (err) {
                console.error('Erro ao recriar a tabela usuários:', err);
                return res.status(500).json({ error: 'Erro ao recriar a tabela usuários' });
            }

            // Crie novamente a tabela usuários
            db.run('CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, email TEXT, senha TEXT)', (err) => {
                if (err) {
                    console.error('Erro ao criar novamente a tabela usuários:', err);
                    return res.status(500).json({ error: 'Erro ao criar novamente a tabela usuários' });
                }

                // Todas as credenciais de usuários foram limpas e a sequência foi reiniciada com sucesso
                return res.status(200).json({ message: 'Todas as credenciais de usuários foram limpas e a sequência foi reiniciada com sucesso' });
            });
        });
    });
}); /// rota pra excluir todos usuarios do banco de dados

app.delete('/usuarios/:id', (req, res) => {
    const userId = req.params.id;

    // Consulta SQL para deletar o usuário pelo ID
    db.run('DELETE FROM usuarios WHERE id = ?', userId, (err) => {
        if (err) {
            console.error('Erro ao deletar usuário:', err);
            return res.status(500).json({ error: 'Erro ao deletar usuário' });
        }

        // Usuário deletado com sucesso
        return res.status(200).json({ message: 'Usuário deletado com sucesso' });
    });
}); /// rota pra deletar usuario pelo ID

app.delete('/usuarios/email/:email', (req, res) => {
    const userEmail = req.params.email;

    // Consulta SQL para deletar o usuário pelo email
    db.run('DELETE FROM usuarios WHERE email = ?', userEmail, (err) => {
        if (err) {
            console.error('Erro ao deletar usuário:', err);
            return res.status(500).json({ error: 'Erro ao deletar usuário' });
        }

        // Usuário deletado com sucesso
        return res.status(200).json({ message: 'Usuário deletado com sucesso' });
    });
}); /// Rota para deletar um usuário por email

app.delete('/usuarios/nome/:nome', (req, res) => {
    const userName = req.params.nome;

    // Consulta SQL para deletar o usuário pelo nome de usuário
    db.run('DELETE FROM usuarios WHERE nome = ?', userName, (err) => {
        if (err) {
            console.error('Erro ao deletar usuário:', err);
            return res.status(500).json({ error: 'Erro ao deletar usuário' });
        }

        // Usuário deletado com sucesso
        return res.status(200).json({ message: 'Usuário deletado com sucesso' });
    });
}); /// Rota para deletar um usuário por nome de usuário

app.post('/login', (req, res) => {
    const { user, senha } = req.body;

    // Consulta SQL para verificar se o email ou o nome de usuário correspondem
    db.get('SELECT * FROM usuarios WHERE (email = ? OR nome = ?) AND senha = ?', [user, user, senha], (err, row) => {
        if (err) {
            console.error('Erro ao fazer login:', err);
            return res.status(500).json({ error: 'Erro ao fazer login' });
        }

        // Verifique se o usuário foi encontrado
        if (row) {
            // Usuário autenticado com sucesso
            try {
                const token = jwt.sign({ id: row.id, nome: row.nome, email: row.email }, 'chave_secreta', { expiresIn: '30d' });
                return res.status(200).json({ message: 'Login bem-sucedido', token });
            } catch (e) {
                console.error('Erro ao criar token JWT:', e);
                return res.status(500).json({ error: 'Erro ao criar token JWT' });
            }
        } else {
            return res.status(401).json({ error: 'E-mail ou senha incorretos' });
        }
    });
}); ///  rota de realizar login no site

app.post('/cadastro', (req, res) => {
    const { user, email, senha } = req.body;

    // Verifique se o email já está cadastrado
    db.get('SELECT * FROM usuarios WHERE email = ?', [email], (err, row) => {
        if (err) {
            console.error('Erro ao verificar o email:', err);
            return res.status(500).json({ error: 'Erro ao verificar o email' });
        }

        if (row) {
            // O email já está cadastrado
            return res.status(400).json({ error: 'O email já está cadastrado' });
        } else {
            // Insere o novo usuário no banco de dados
            db.run('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)', [user, email, senha], (err) => {
                if (err) {
                    console.error('Erro ao cadastrar o usuário:', err);
                    return res.status(500).json({ error: 'Erro ao cadastrar o usuário' });
                }

                // Usuário cadastrado com sucesso
                return res.status(201).json({ message: 'Usuário cadastrado com sucesso' });
            });
        }
    });
}); /// rota de realizar cadastro no site

const organizarEpisodios = () => {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT * FROM episodios
            ORDER BY anime_id, temporada, numero;
        `;
        
        db.all(query, (error, rows) => {
            if (error) {
                reject('Erro ao buscar episódios:', error);
            }
            
            const promises = [];
            let nextId = 1;
            
            // Itera sobre os episódios e atualiza os IDs
            rows.forEach(row => {
                const updateQuery = `
                    UPDATE episodios
                    SET id = ?
                    WHERE id = ? AND anime_id = ?;
                `;
                const updatePromise = new Promise((resolve, reject) => {
                    db.run(updateQuery, [nextId, row.id, row.anime_id], (error) => {
                        if (error) {
                            reject('Erro ao atualizar episódio:', error);
                        } else {
                            resolve();
                        }
                    });
                });
                promises.push(updatePromise);
                
                nextId++;
            });
            
            // Executa todas as promessas em paralelo
            Promise.all(promises)
                .then(() => {
                    resolve('IDs dos episódios atualizados com sucesso!');
                })
                .catch(error => {
                    reject(error);
                });
        });
    });
};

app.post('/inserirDados', (req, res) => {
    const anime = req.body;
    const episodios = anime.episodios; // Extrai os episódios do corpo da requisição
    delete anime.episodios; // Remove os episódios do objeto anime principal

    // Consulta para buscar o último ID inserido na tabela animes
    const queryUltimoId = 'SELECT MAX(id) as ultimoId FROM animes';

    // Consulta para inserir o novo anime
    const queryAnime = 'INSERT INTO animes (id, capa, titulo, tituloAlternativo, selo, sinopse, genero, classificacao, status, qntd_temporadas, anoLancamento, dataPostagem, ovas, filmes, estudio, diretor, tipoMidia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

    db.get(queryUltimoId, [], (error, row) => {
        if (error) {
            console.error('Erro ao buscar o último ID:', error);
            res.status(500).send('Erro ao inserir os dados do anime no banco de dados.');
            return;
        }

        const proximoId = (row.ultimoId || 0) + 1; // Incrementa o último ID encontrado ou define como 1 se não houver registros

        db.run(queryAnime, [
            proximoId, // Define o próximo ID
            anime.capa, 
            anime.titulo, 
            anime.tituloAlternativo, 
            anime.selo, 
            anime.sinopse,
            anime.genero.join(','), // Usando diretamente o valor do gênero recebido
            anime.classificacao, 
            anime.status, 
            anime.qntd_temporadas, 
            anime.anoLancamento, 
            anime.dataPostagem, 
            anime.ovas, 
            anime.filmes, 
            anime.estudio, 
            anime.diretor,
            anime.tipoMidia
        ], function(error) {
            if (error) {
                console.error('Erro ao inserir os dados do anime:', error);
                res.status(500).send('Erro ao inserir os dados do anime no banco de dados.');
                return;
            }
            
            console.log('Anime inserido com sucesso! ID:', proximoId);
            const animeId = proximoId;

            // Agora insira os episódios associados ao anime
            if (episodios && episodios.length > 0) {
                const queryEpisodios = 'INSERT INTO episodios (temporada, numero, nome, link, capa_ep, anime_id, data_lancamento) VALUES (?, ?, ?, ?, ?, ?, ?)';
                const agora = new Date().toISOString().slice(0, 19).replace('T', ' '); // Obtém a data e hora atuais no formato 'YYYY-MM-DD HH:MM:SS'
                
                episodios.forEach(episodio => {
                    db.run(queryEpisodios, [
                        episodio.temporada,
                        episodio.numero,
                        episodio.nome,
                        episodio.link,
                        episodio.capa_ep,
                        animeId,
                        agora // Define a data e hora atuais para cada episódio
                    ], function(error) {
                        if (error) {
                            console.error('Erro ao inserir episódio:', error);
                            return res.status(500).send('Erro ao inserir episódio no banco de dados.');
                        }
                        console.log('Episódio inserido com sucesso! ID:', this.lastID);
                    });
                });
            }

            // Retornar o ID do anime recém-inserido
            res.status(200).json({ id: animeId });
        });
    });
});
/// rota pra inserir dados no geral no banco de dados 

app.post('/inserirEpisodios', (req, res) => {
    const episodios = req.body.episodios;
    const animeId = req.body.animeId;
    console.log('Episódios recebidos:', episodios); 
    console.log('ID do anime associado:', animeId); 

    // Iniciar uma transação SQLite
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const query = 'INSERT INTO episodios (temporada, numero, nome, link, capa_ep, anime_id) VALUES (?, ?, ?, ?, ?, ?)';
        let successCount = 0;
    
        episodios.forEach(episodio => {
            // Verificar se o número do episódio já existe para o anime
            db.get('SELECT * FROM episodios WHERE temporada = ? AND numero = ? AND anime_id = ?', [episodio.temporada, episodio.numero, animeId], (error, row) => {
                if (error) {
                    console.error('Erro ao verificar a existência do episódio:', error);
                    db.run('ROLLBACK');
                    res.status(500).json({ message: 'Erro ao verificar a existência do episódio.' });
                    return;
                }
                if (row) {
                    console.error('O episódio já existe para este anime:', episodio.numero);
                    res.status(400).json({ message: 'O episódio já existe para este anime.' });
                    return;
                }
                
                // Se o episódio não existe, realizar a inserção
                db.run(query, [episodio.temporada, episodio.numero, episodio.nome, episodio.link, episodio.capa_ep, animeId], (error) => {
                    if (error) {
                        console.error('Erro ao inserir os dados do episódio:', error);
                        db.run('ROLLBACK');
                        res.status(500).json({ message: 'Erro ao inserir os dados do episódio no banco de dados.' });
                        return;
                    } else {
                        console.log('Dados do episódio inseridos com sucesso!');
                        successCount++;
                        if (successCount === episodios.length) {
                            // Se todos os episódios foram inseridos com sucesso, commit a transação
                            db.run('COMMIT');
                            res.status(200).json({ message: 'Dados dos episódios inseridos com sucesso!' });
                        }
                    }
                });
            });
        });
    });
}); /// inserir episodios no banco de dados 

app.put('/catalogo/:id', (req, res) => {
    const animeId = req.params.id;
    const newAnimeData = req.body;

    // Consulta SQL para atualizar os dados do anime pelo ID
    const query = `
        UPDATE animes 
        SET 
            id = ?,
            capa = ?,
            titulo = ?,
            tituloAlternativo = ?,
            selo = ?,
            sinopse = ?,
            genero = ?,
            classificacao = ?,
            status = ?,
            qntd_temporadas = ?,
            anoLancamento = ?,
            dataPostagem = ?,
            ovas = ?,
            filmes = ?,
            estudio = ?,
            diretor = ?,
            tipoMidia = ?
        WHERE 
            id = ?
    `;

    const dataValues = [
        newAnimeData.id,
        newAnimeData.capa,
        newAnimeData.titulo,
        newAnimeData.tituloAlternativo,
        newAnimeData.selo,
        newAnimeData.sinopse,
        newAnimeData.genero.join(','), // Considerando que os gêneros são enviados como uma lista
        newAnimeData.classificacao,
        newAnimeData.status,
        newAnimeData.qntd_temporadas,
        newAnimeData.anoLancamento,
        newAnimeData.dataPostagem,
        newAnimeData.ovas,
        newAnimeData.filmes,
        newAnimeData.estudio,
        newAnimeData.diretor,
        newAnimeData.tipoMidia,
        animeId
    ];

    // Incluir lógica para atualizar os dados dos episódios associados
    const updateEpisodesQuery = `
        UPDATE episodios 
        SET 
            temporada = ?,
            numero = ?,
            nome = ?,
            link = ?,
            capa_ep = ?
        WHERE 
            id = ? AND anime_id = ?
    `;

    const episodesData = newAnimeData.episodios;

    // Função para atualizar os episódios
    const updateEpisodes = (db, updateEpisodesQuery, episodesData, animeId) => {
        return new Promise((resolve, reject) => {
            // Exclui todos os episódios existentes para este anime
            const deleteEpisodesQuery = `
                DELETE FROM episodios 
                WHERE anime_id = ?;
            `;
            db.run(deleteEpisodesQuery, [animeId], (error) => {
                if (error) {
                    reject('Erro ao excluir episódios existentes:', error);
                }
                
    
                // Itera sobre os episódios fornecidos e insere-os no banco de dados
                episodesData.forEach(episodio => {
                    const episodeValues = [
                        episodio.temporada,
                        episodio.numero,
                        episodio.nome,
                        episodio.link,
                        episodio.capa_ep,
                        animeId
                    ];
    
                    const insertEpisodeQuery = `
                        INSERT INTO episodios (temporada, numero, nome, link, capa_ep, anime_id) 
                        VALUES (?, ?, ?, ?, ?, ?);
                    `;
                    db.run(insertEpisodeQuery, episodeValues, (error) => {
                        if (error) {
                            reject('Erro ao inserir episódio:', error);
                        }
                    });
                });
    
                // Resolve a promessa após a atualização dos episódios
                resolve();
            });
        });
    };

    // Atualizar os episódios primeiro
    updateEpisodes(db, updateEpisodesQuery, episodesData, animeId)
        .then(() => {
            // Após atualizar os episódios, atualizar os dados do anime principal
            db.run(query, dataValues, (error) => {
                if (error) {
                    console.error('Erro ao atualizar os dados do anime:', error);
                    return res.status(500).send('Erro ao atualizar os dados do anime no banco de dados.');
                }
                res.status(200).json({ message: 'Dados do anime atualizados com sucesso!' });
            });
        })
        .catch((error) => {
            console.error(error);
            return res.status(500).send(error);
        });
}); /// rota pra editar um anime existente ja no banco de dados pelo ID

app.get('/todosAnimes/:id?', (req, res) => {
    const animeId = req.params.id;

    // Verifica se o parâmetro ID está presente na URL
    if (animeId) {
        // Consulta SQL para selecionar os dados de um anime específico pelo ID
        const query = `
            SELECT 
                a.id,
                a.capa,
                a.titulo,
                a.tituloAlternativo,
                a.selo,
                a.sinopse,
                a.genero,
                a.classificacao,
                a.status,
                a.qntd_temporadas,
                a.anoLancamento,
                a.dataPostagem,
                a.ovas,
                a.filmes,
                a.estudio,
                a.diretor,
                a.tipoMidia,
                e.temporada,
                e.numero,
                e.nome AS nome_episodio,
                e.link,
                e.capa_ep,
                a.visualizacoes AS visualizacoes
            FROM 
                animes a
            LEFT JOIN 
                episodios e ON a.id = e.anime_id
            WHERE
                a.id = ?
            ORDER BY e.numero ASC; // Ordena os episódios por número de episódio
        `;

        db.all(query, [animeId], (error, rows) => {
            if (error) {
                console.error('Erro ao selecionar os dados do anime:', error);
                return res.status(500).send('Erro ao selecionar os dados do anime do banco de dados.');
            }

            // Verifica se há resultados
            if (rows.length === 0) {
                return res.status(404).send('Anime não encontrado.');
            }

            // Mapeie os resultados para formatar os dados conforme desejado
            const anime = {
                id: rows[0].id,
                capa: rows[0].capa,
                titulo: rows[0].titulo,
                tituloAlternativo: rows[0].tituloAlternativo,
                selo: rows[0].selo,
                sinopse: rows[0].sinopse,
                generos: rows[0].genero ? rows[0].genero.split(',') : [],
                classificacao: rows[0].classificacao,
                status: rows[0].status,
                qntd_temporadas: rows[0].qntd_temporadas,
                anoLancamento: rows[0].anoLancamento,
                dataPostagem: rows[0].dataPostagem,
                ovas: rows[0].ovas,
                filmes: rows[0].filmes,
                estudio: rows[0].estudio,
                diretor: rows[0].diretor,
                tipoMidia: rows[0].tipoMidia,
                visualizacoes: rows[0].visualizacoes,
                episodios: []
            };

            // Adicione os episódios ao anime, se houver
            rows.forEach(row => {
                if (row.temporada && row.numero) {
                    // Se houver um episódio associado, adicione-o ao anime atual
                    anime.episodios.push({
                        temporada: row.temporada,
                        numero: row.numero,
                        nome: row.nome_episodio,
                        link: row.link,
                        capa_ep: row.capa_ep
                    });
                }
            });

            res.status(200).json(anime);
        });
    } else {
        // Se o parâmetro ID não estiver presente, retorna todos os animes
        // Consulta SQL para selecionar todos os dados da tabela "animes" juntamente com os episódios associados
        const query = `
            SELECT 
                a.id,
                a.capa,
                a.titulo,
                a.tituloAlternativo,
                a.selo,
                a.sinopse,
                a.genero,
                a.classificacao,
                a.status,
                a.qntd_temporadas,
                a.anoLancamento,
                a.dataPostagem,
                a.ovas,
                a.filmes,
                a.estudio,
                a.diretor,
                a.tipoMidia,
                e.temporada,
                e.numero,
                e.nome AS nome_episodio,
                e.link,
                e.capa_ep,
                a.visualizacoes AS visualizacoes
            FROM 
                animes a
            LEFT JOIN 
                episodios e ON a.id = e.anime_id;
        `;

        db.all(query, (error, rows) => {
            if (error) {
                console.error('Erro ao selecionar os dados dos animes:', error);
                return res.status(500).send('Erro ao selecionar os dados dos animes do banco de dados.');
            }

            // Mapeie os resultados para formatar os dados conforme desejado
            const animes = [];
            let currentAnimeId = null;
            let currentAnime = null;

            rows.forEach(row => {
                if (row.id !== currentAnimeId) {
                    // Um novo anime foi encontrado
                    currentAnime = {
                        id: row.id,
                        capa: row.capa,
                        titulo: row.titulo,
                        tituloAlternativo: row.tituloAlternativo,
                        selo: row.selo,
                        sinopse: row.sinopse,
                        generos: row.genero ? row.genero.split(',') : [],
                        classificacao: row.classificacao,
                        status: row.status,
                        qntd_temporadas: row.qntd_temporadas,
                        anoLancamento: row.anoLancamento,
                        dataPostagem: row.dataPostagem,
                        ovas: row.ovas,
                        filmes: row.filmes,
                        estudio: row.estudio,
                        diretor: row.diretor,
                        tipoMidia: row.tipoMidia,
                        visualizacoes: row.visualizacoes,
                        episodios: []
                    };
                    animes.push(currentAnime);
                    currentAnimeId = row.id;
                }

                if (row.temporada && row.numero) {
                    // Se houver um episódio associado, adicione-o ao anime atual
                    currentAnime.episodios.push({
                        temporada: row.temporada,
                        numero: row.numero,
                        nome: row.nome_episodio,
                        link: row.link,
                        capa_ep: row.capa_ep
                    });
                }
            });

            res.status(200).json(animes);
        });
    }
}); /// rota que envia todos resultados de todos animes se nao especificar id como parametro e se especificar id retorna o valor de um catalogo em especifico

const RESULTS_PER_PAGE = 30; // Quantidade de resultados por página

app.get('/animesPagina/:page?', (req, res) => {
    const page = parseInt(req.params.page) || 1; // Página padrão é a página 1

    // Calcular o deslocamento
    const offset = (page - 1) * RESULTS_PER_PAGE;

    // Consulta SQL para contar o número total de registros na tabela de animes
    const countQuery = `SELECT COUNT(*) AS total FROM animes`;

    // Função para obter estatísticas
    function getStatistics(callback) {
        db.get('SELECT total_animes, total_episodios FROM estatisticas ORDER BY data_atualizacao DESC LIMIT 1', (error, row) => {
            if (error) {
                console.error('Erro ao consultar estatísticas:', error);
                return callback(error);
            }
            callback(null, row);
        });
    }

    // Obter o total de animes e episódios
    getStatistics((error, statistics) => {
        if (error) {
            return res.status(500).send('Erro ao obter estatísticas.');
        }

        // Consultar o total de registros e dados dos animes e episódios
        db.get(countQuery, (error, countRow) => {
            if (error) {
                console.error('Erro ao contar o número total de registros:', error);
                return res.status(500).send('Erro ao contar o número total de registros na tabela de animes.');
            }

            const totalRecords = countRow.total;
            const totalPages = Math.ceil(totalRecords / RESULTS_PER_PAGE);

            const query = `
                SELECT 
                    a.id AS anime_id,
                    a.capa AS anime_capa,
                    a.titulo AS anime_titulo,
                    a.tituloAlternativo AS anime_tituloAlternativo,
                    a.selo AS anime_selo,
                    a.sinopse AS anime_sinopse,
                    a.genero AS anime_genero,
                    a.classificacao AS anime_classificacao,
                    a.status AS anime_status,
                    a.qntd_temporadas AS anime_qntd_temporadas,
                    a.anoLancamento AS anime_anoLancamento,
                    a.dataPostagem AS anime_dataPostagem,
                    a.ovas AS anime_ovas,
                    a.filmes AS anime_filmes,
                    a.estudio AS anime_estudio,
                    a.diretor AS anime_diretor,
                    a.tipoMidia AS anime_tipoMidia,
                    e.temporada AS episodio_temporada,
                    e.numero AS episodio_numero,
                    e.nome AS episodio_nome,
                    e.link AS episodio_link,
                    e.capa_ep AS episodio_capa_ep
                FROM 
                    animes a
                LEFT JOIN 
                    episodios e ON a.id = e.anime_id
                WHERE 
                    a.id IN (
                        SELECT id FROM animes ORDER BY id ASC LIMIT ? OFFSET ?
                    )
                ORDER BY a.id ASC, e.numero ASC;
            `;

            db.all(query, [RESULTS_PER_PAGE, offset], (error, rows) => {
                if (error) {
                    console.error('Erro ao selecionar os dados dos animes:', error);
                    return res.status(500).send('Erro ao selecionar os dados dos animes do banco de dados.');
                }

                // Mapeie os resultados para formatar os dados conforme desejado
                const animes = [];
                let currentAnime = null;

                rows.forEach(row => {
                    if (!currentAnime || currentAnime.id !== row.anime_id) {
                        // Um novo anime foi encontrado
                        currentAnime = {
                            id: row.anime_id,
                            capa: row.anime_capa,
                            titulo: row.anime_titulo,
                            tituloAlternativo: row.anime_tituloAlternativo,
                            selo: row.anime_selo,
                            sinopse: row.anime_sinopse,
                            generos: row.anime_genero ? row.anime_genero.split(',') : [],
                            classificacao: row.anime_classificacao,
                            status: row.anime_status,
                            qntd_temporadas: row.anime_qntd_temporadas,
                            anoLancamento: row.anime_anoLancamento,
                            dataPostagem: row.anime_dataPostagem,
                            ovas: row.anime_ovas,
                            filmes: row.anime_filmes,
                            estudio: row.anime_estudio,
                            diretor: row.anime_diretor,
                            tipoMidia: row.anime_tipoMidia,
                            episodios: []
                        };
                        animes.push(currentAnime);
                    }

                    if (row.episodio_temporada && row.episodio_numero) {
                        // Adicione todos os dados do episódio ao anime atual
                        currentAnime.episodios.push({
                            temporada: row.episodio_temporada,
                            numero: row.episodio_numero,
                            nome: row.episodio_nome,
                            link: row.episodio_link,
                            capa_ep: row.episodio_capa_ep
                        });
                    }
                });

                const paginatedAnimes = animes.slice(0, RESULTS_PER_PAGE);

                // Retornar os dados no formato desejado
                res.status(200).json({
                    animes: paginatedAnimes,
                    totalPages: totalPages,
                    totalAnimes: statistics ? statistics.total_animes : null,
                    totalEpisodios: statistics ? statistics.total_episodios : null
                });
            });
        });
    });
}); /// recebe animes de acordo com a paginaçao

app.delete('/limparBanco', (req, res) => {
  // Consulta SQL para deletar todos os dados da tabela "animes"
  const deleteAnimesQuery = 'DELETE FROM animes';
  // Consulta SQL para deletar todos os dados da tabela "episodios"
  const deleteEpisodiosQuery = 'DELETE FROM episodios';
  // Consulta SQL para resetar a sequência da tabela "animes"
  const resetAnimesSequenceQuery = 'DELETE FROM sqlite_sequence WHERE name="animes"';
  // Consulta SQL para resetar a sequência da tabela "episodios"
  const resetEpisodiosSequenceQuery = 'DELETE FROM sqlite_sequence WHERE name="episodios"';

  db.run(deleteAnimesQuery, (error) => {
      if (error) {
          console.error('Erro ao limpar o banco de dados (animes):', error);
          res.status(500).send('Erro ao limpar o banco de dados (animes).');
          return;
      }
      console.log('Dados da tabela "animes" excluídos com sucesso!');

      // Após excluir os animes, exclua os episódios
      db.run(deleteEpisodiosQuery, (error) => {
          if (error) {
              console.error('Erro ao limpar o banco de dados (episódios):', error);
              res.status(500).send('Erro ao limpar o banco de dados (episódios).');
              return;
          }
          console.log('Dados da tabela "episódios" excluídos com sucesso!');

          // Após excluir os episódios, resete a sequência da tabela "animes"
          db.run(resetAnimesSequenceQuery, (error) => {
              if (error) {
                  console.error('Erro ao resetar a sequência da tabela "animes":', error);
                  res.status(500).send('Erro ao resetar a sequência da tabela "animes".');
                  return;
              }
              console.log('Sequência da tabela "animes" resetada com sucesso!');

              // Após excluir os episódios, resete a sequência da tabela "episodios"
              db.run(resetEpisodiosSequenceQuery, (error) => {
                  if (error) {
                      console.error('Erro ao resetar a sequência da tabela "episodios":', error);
                      res.status(500).send('Erro ao resetar a sequência da tabela "episodios".');
                      return;
                  }
                  console.log('Sequência da tabela "episodios" resetada com sucesso!');
                  res.status(200).json({ message: 'Banco de dados limpo com sucesso!' }); // Enviar resposta em JSON
              });
          });
      });
  });
}); /// rota que limpa o banco de dados por completo

app.delete('/excluirAnime/:id', (req, res) => {
    const animeId = req.params.id;

    // Consulta SQL para excluir o anime pelo ID
    const deleteAnimeQuery = 'DELETE FROM animes WHERE id = ?';

    // Consulta SQL para excluir os episódios associados ao anime pelo ID
    const deleteEpisodiosQuery = 'DELETE FROM episodios WHERE anime_id = ?';

    // Executa a consulta para excluir o anime pelo ID
    db.run(deleteAnimeQuery, [animeId], (error) => {
        if (error) {
            console.error('Erro ao excluir o anime:', error);
            res.status(500).send('Erro ao excluir o anime do banco de dados.');
            return;
        }
        console.log('Anime excluído com sucesso!');

        // Executa a consulta para excluir os episódios associados ao anime pelo ID
        db.run(deleteEpisodiosQuery, [animeId], (error) => {
            if (error) {
                console.error('Erro ao excluir os episódios do anime:', error);
                res.status(500).send('Erro ao excluir os episódios do anime do banco de dados.');
                return;
            }
            console.log('Episódios do anime excluídos com sucesso!');
            
            // Envie uma resposta indicando que o anime e seus episódios foram excluídos com sucesso
            res.status(200).json({ message: 'Anime e episódios excluídos com sucesso!' });
        });
    });
}); /// rota pra excluir um anime especifico pelo ID

app.put('/alterarDominio', (req, res) => {
    const { dominioAntigo, dominioNovo } = req.body;

    // Verifica se ambos os domínios foram fornecidos no corpo da solicitação
    if (!dominioAntigo || !dominioNovo) {
        return res.status(400).send('Os domínios antigo e novo devem ser fornecidos.');
    }

    // Atualizar links dos episódios
    db.run('UPDATE episodios SET link = REPLACE(link, ?, ?)', [dominioAntigo, dominioNovo], (error) => {
        if (error) {
            console.error('Erro ao atualizar os links dos episódios:', error);
            return res.status(500).send('Erro ao atualizar os links dos episódios.');
        }

        // Atualizar links das capas dos animes
        db.run('UPDATE animes SET capa = REPLACE(capa, ?, ?)', [dominioAntigo, dominioNovo], (error) => {
            if (error) {
                console.error('Erro ao atualizar os links das capas dos animes:', error);
                return res.status(500).send('Erro ao atualizar os links das capas dos animes.');
            }

            // Atualizar links das capas dos episódios
            db.run('UPDATE episodios SET capa_ep = REPLACE(capa_ep, ?, ?)', [dominioAntigo, dominioNovo], (error) => {
                if (error) {
                    console.error('Erro ao atualizar os links das capas dos episódios:', error);
                    return res.status(500).send('Erro ao atualizar os links das capas dos episódios.');
                }

                console.log('Links atualizados com sucesso.');
                res.status(200).send('Links atualizados com sucesso.');
            });
        });
    });
}); /// rota pra alterar o dominio do site onde os video e imagem de capas dos video estao sendo apontados bem util caso o dominio do site mude

app.post('/api/gerar-link-temporario', (req, res) => {
    const { linkVideo } = req.body;
    const idTemporario = uuidv4();
    const dataExpiracao = Date.now() + 2 * 60 * 60 * 1000; // 2 horas em milissegundos

    db.run("INSERT INTO links (idTemporario, linkVideo, dataExpiracao) VALUES (?, ?, ?)", [idTemporario, linkVideo, dataExpiracao], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao armazenar o link temporário no banco de dados' });
        }

        const temporaryLink = `${vpsUrl}/api/receber-link-temporario/${idTemporario}`;
        res.json({ temporaryLink });
    });
}); /// rota pra gerar link temporario

app.get('/api/receber-link-temporario/:idTemporario', (req, res) => {
    const { idTemporario } = req.params;

    db.get("SELECT linkVideo, dataExpiracao FROM links WHERE idTemporario = ?", [idTemporario], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao recuperar o link do vídeo do banco de dados' });
        }

        if (!row) {
            return res.status(404).json({ error: 'Link temporário não encontrado' });
        }

        const { linkVideo, dataExpiracao } = row;

        // Verifica se o link temporário expirou
        if (dataExpiracao < Date.now()) {
            // Se expirado, exclui o link temporário da tabela
            db.run("DELETE FROM links WHERE idTemporario = ?", [idTemporario], (deleteErr) => {
                if (deleteErr) {
                    return res.status(500).json({ error: 'Erro ao excluir o link temporário do banco de dados' });
                }

                // Após excluir o link, chama o vácuo para otimização do banco de dados
                db.run("VACUUM", [], (vacuumErr) => {
                    if (vacuumErr) {
                        console.error('Erro ao executar vacuum:', vacuumErr);
                    } else {
                        console.log('Vácuo executado com sucesso.');
                    }
                });
            });
            return res.status(404).json({ error: 'Link temporário expirado' });
        }

        // Redireciona para o link do vídeo correspondente
        res.redirect(linkVideo);
    });
}); /// rota pra receber o link temporario

app.get('/titulos-semelhantes/:id', (req, res) => {
    const animeId = req.params.id;

    const query = `
        SELECT 
            animes.id,
            animes.titulo,
            animes.capa AS foto_capa
        FROM 
            animes
        WHERE
            animes.genero = (SELECT genero FROM animes WHERE id = ?)
            AND animes.id != ?
        LIMIT 10;
    `;

    db.all(query, [animeId, animeId], (error, rows) => {
        if (error) {
            console.error('Erro ao selecionar os títulos semelhantes ao anime:', error);
            return res.status(500).send('Erro ao selecionar os títulos semelhantes ao anime do banco de dados.');
        }

        if (rows.length === 0) {
            return res.status(404).send('Não foram encontrados títulos semelhantes ao anime.');
        }

        // Formata os resultados conforme desejado
        const titulosSemelhantes = rows.map(row => ({
            id: row.id,
            titulo: row.titulo,
            foto_capa: row.foto_capa // Adiciona a URL da foto de capa
        }));

        res.status(200).json(titulosSemelhantes);
    });
});

app.get('/animes_exibir/:anime_id', (req, res) => {
    const animeId = req.params.anime_id;

    // Consulta SQL para obter informações do anime
    const animeQuery = `
        SELECT *
        FROM Animes_exibir
        WHERE anime_id = ?
    `;

    // Consulta SQL para obter episódios relacionados ao anime, ordenados pelo número do episódio
    const episodiosQuery = `
        SELECT episodios_exibir.*, 
               episodios_exibir.link_extra_1 AS link_extra_1,
               episodios_exibir.link_extra_2 AS link_extra_2,
               episodios_exibir.link_extra_3 AS link_extra_3
        FROM Episodios_exibir
        WHERE anime_id = ?
        ORDER BY episodio ASC
    `;

    // Executar a consulta SQL para obter informações do anime
    db.all(animeQuery, [animeId], (err, animeRows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Erro ao buscar informações do anime');
            return;
        }

        // Executar a consulta SQL para obter episódios relacionados ao anime
        db.all(episodiosQuery, [animeId], (err, episodiosRows) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('Erro ao buscar episódios do anime');
                return;
            }

            // Combinar dados do anime e episódios em uma única resposta
            const responseData = {
                anime: animeRows[0], // Assume-se que há apenas um anime com o mesmo anime_id
                episodios: episodiosRows
            };

            // Enviar os dados combinados como resposta
            res.json(responseData);
        });
    });
});

app.delete('/animes_exibir/:anime_id', (req, res) => {
    const animeId = req.params.anime_id;

    // Consulta SQL para excluir os episódios relacionados ao anime da tabela Episodios_exibir
    const deleteEpisodiosQuery = `
        DELETE FROM Episodios_exibir
        WHERE anime_id = ?
    `;

    // Executar a consulta SQL para excluir os episódios relacionados ao anime
    db.run(deleteEpisodiosQuery, [animeId], function(err) {
        if (err) {
            console.error(err.message);
            res.status(500).send('Erro ao excluir episódios do anime');
            return;
        }

        // Consulta SQL para redefinir o contador de sequência para a tabela episodios
        const resetEpisodiosSequenceQuery = `
            UPDATE SQLITE_SEQUENCE SET seq = 0 WHERE name = 'episodios';
        `;

        // Executar a consulta SQL para redefinir o contador de sequência para a tabela episodios
        db.run(resetEpisodiosSequenceQuery, function(err) {
            if (err) {
                console.error(err.message);
                res.status(500).send('Erro ao redefinir o contador de sequência para a tabela episodios');
                return;
            }

            // Envie uma resposta de sucesso após a exclusão e redefinição bem-sucedidas
            res.status(200).send('Episódios excluídos e contador de sequência redefinido com sucesso!');
        });
    });
}); /// Essa rota DELETE irá remover o anime e todos os episódios associados a ele com base no anime_id fornecido.

app.post('/animes_exibir/:anime_id', (req, res) => {
    const animeId = req.params.anime_id;
    const { titulo, episodios } = req.body;

    // Log dos dados recebidos
    console.log('Dados recebidos:');
    console.log('animeId:', animeId);
    console.log('titulo:', titulo);
    console.log('episodios:', episodios);

    // Inserir informações do anime na tabela Animes_exibir
    const insertAnimeQuery = `
        INSERT INTO Animes_exibir (anime_id, titulo)
        VALUES (?, ?)
    `;
    
    db.run(insertAnimeQuery, [animeId, titulo], function(err) {
        if (err) {
            console.error(err.message);
            res.status(500).send('Erro ao inserir anime');
            return;
        }

        // Anime inserido com sucesso, agora inserir os episódios relacionados
        episodios.forEach(episodio => {
            const { temporada, episodio: numEpisodio, descricao, link, link_extra } = episodio;
            const insertEpisodioQuery = `
                INSERT INTO Episodios_exibir (anime_id, temporada, episodio, descricao, link, link_extra_1, link_extra_2, link_extra_3)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const values = [animeId, temporada, numEpisodio, descricao, link, link_extra.link_extra_1, link_extra.link_extra_2, link_extra.link_extra_3];
        
            db.run(insertEpisodioQuery, values, function(err) {
                if (err) {
                    console.error(err.message);
                    res.status(500).send('Erro ao inserir episódio');
                    return;
                }
            });
        });
        
        // Enviar resposta de sucesso após a conclusão da inserção de todos os episódios
        res.status(200).send('Anime e episódios inseridos com sucesso!');
    });
}); /// rota pra inserir os detalhes dos animes na tabela 

app.post('/animes_exibir_editar/:anime_id', (req, res) => {
    const animeId = req.params.anime_id;
    const { titulo, episodios } = req.body;

    // Log dos dados recebidos
    console.log('Dados recebidos:');
    console.log('animeId:', animeId);
    console.log('titulo:', titulo);
    console.log('episodios:', episodios);

    // Iniciar a transação
    db.serialize(() => {
        // Atualizar o título do anime
        db.run('UPDATE animes_exibir SET titulo = ? WHERE id = ?', [titulo, animeId], function(err) {
            if (err) {
                console.error('Erro ao atualizar o título do anime:', err.message);
                res.status(500).send('Erro ao atualizar o título do anime');
                return;
            }

            // Deletar todos os episódios existentes para o anime
            db.run('DELETE FROM Episodios_exibir WHERE anime_id = ?', [animeId], function(err) {
                if (err) {
                    console.error('Erro ao deletar episódios existentes:', err.message);
                    res.status(500).send('Erro ao deletar episódios existentes');
                    return;
                }

                // Inserir os novos episódios na ordem correta
                const insertEpisodioQuery = `
                    INSERT INTO Episodios_exibir (anime_id, temporada, episodio, descricao, link, link_extra_1, link_extra_2, link_extra_3)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;
                let insertedCount = 0; // Contador para verificar se todos os episódios foram inseridos com sucesso
                episodios.forEach(episodio => {
                    const { temporada, episodio: numEpisodio, descricao, link, link_extra_1, link_extra_2, link_extra_3 } = episodio;
                    
                    // Verificar se os links extras foram enviados vazios e tratá-los adequadamente
                    const linksExtras = [link_extra_1, link_extra_2, link_extra_3];
                    const linksExtrasTratados = linksExtras.map(linkExtra => {
                        return linkExtra !== undefined ? linkExtra : null;
                    });

                    db.run(insertEpisodioQuery, [animeId, temporada, numEpisodio, descricao, link, ...linksExtrasTratados], function(err) {
                        if (err) {
                            console.error('Erro ao inserir episódio:', err.message);
                            res.status(500).send('Erro ao inserir episódio');
                            return;
                        }
                        insertedCount++;
                        // Verificar se todos os episódios foram inseridos
                        if (insertedCount === episodios.length) {
                            // Todos os episódios foram inseridos, enviar resposta de sucesso
                            res.status(200).send('Episódios atualizados com sucesso!');
                        }
                    });
                });
            });
        });
    });
}); /// rota pra editar os detalhes dos animes na tabela 

app.post('/animes/:id/visualizar', (req, res) => {
    const { id } = req.params;
    db.run(`UPDATE animes SET visualizacoes = visualizacoes + 1 WHERE id = ?`, [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: `Visualizações do anime com ID ${id} incrementadas.` });
    });
}); /// rota pra incrementar visualizaçao de um anime com o id dele na tabela

app.get('/animes/:id/visualizacoes', (req, res) => {
    const { id } = req.params;
    db.get(`SELECT visualizacoes FROM animes WHERE id = ?`, [id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ error: `Anime com ID ${id} não encontrado.` });
            return;
        }
        res.json({ id, visualizacoes: row.visualizacoes });
    });
}); /// rota pra receber os valores de vizualizados na tabela

app.post('/animes/:id/zerar', (req, res) => {
    const { id } = req.params;
    db.run(`UPDATE animes SET visualizacoes = 0 WHERE id = ?`, [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: `Visualizações do anime com ID ${id} foram zeradas.` });
    });
}); /// rota pra zerar os valores de visualizados de uma anime na tabela

app.get('/animes/status/:status', (req, res) => {
    const { status } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    db.all(`SELECT * FROM animes WHERE status = ? LIMIT ? OFFSET ?`, [status, limit, offset], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        db.get(`SELECT COUNT(*) AS total FROM animes WHERE status = ?`, [status], (err, result) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }

            const total = result.total;
            const totalPages = Math.ceil(total / limit);

            res.json({
                paginaAtual: page,
                paginaTotal: totalPages,
                itensTotal: total,
                itens: rows
            });
        });
    });
}); ///rota pra receber status dos animes que estao em andamentos completos basicamente retorna os animes com base nos status deles

app.get('/generate-sitemap', (req, res) => {
    const baseUrl = req.query.url;
    const type = req.query.type; // 'animes', 'episodes', or 'both'

    if (!baseUrl) {
        return res.status(400).send('URL base é necessária como parâmetro.');
    }

    if (!type || !['a', 'e', 't'].includes(type)) {
        return res.status(400).send('Tipo inválido. Use "animes", "episodios" ou "both".');
    }

    db.all("SELECT id FROM animes", [], (err, animeRows) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Erro ao consultar o banco de dados.');
        }

        if (!animeRows.length) {
            return res.status(404).send('Nenhum anime encontrado no banco de dados.');
        }

        const urls = [];
        let processedAnimes = 0;

        animeRows.forEach(anime => {
            // Adiciona URL do anime se o tipo for 'animes' ou 'both'
            if (type === 'a' || type === 't') {
                urls.push({
                    loc: `${baseUrl}/a?id=${anime.id}`,
                    changefreq: 'weekly',
                    priority: 0.8
                });
            }

            if (type === 'e' || type === 't') {
                // Consulta os episódios do anime
                db.all("SELECT numero FROM episodios WHERE anime_id = ?", [anime.id], (err, episodeRows) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('Erro ao consultar os episódios do banco de dados.');
                    }

                    episodeRows.forEach(episode => {
                        // Adiciona URLs dos episódios
                        urls.push({
                            loc: `${baseUrl}/a?id=${anime.id}&ep=${episode.numero}`,
                            changefreq: 'weekly',
                            priority: 0.8
                        });
                    });

                    processedAnimes++;
                    if (processedAnimes === animeRows.length) {
                        generateSitemap(res, urls);
                    }
                });
            } else {
                processedAnimes++;
                if (processedAnimes === animeRows.length) {
                    generateSitemap(res, urls);
                }
            }
        });
    });
});

function generateSitemap(res, urls) {
    const builder = new Builder();
    const sitemap = builder.buildObject({
        urlset: {
            $: {
                xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9'
            },
            url: urls
        }
    });

    const filePath = 'sitemap.xml';
    fs.writeFileSync(filePath, sitemap);

    res.download(filePath, 'sitemap.xml', (err) => {
        if (err) {
            console.error(err);
        }
        fs.unlinkSync(filePath); // Remove o arquivo após o download
    });
}

app.get('/pesquisa/termo', (req, res) => {
    const searchTerm = req.query.term; // Parâmetro de consulta 'term' na URL
    if (!searchTerm) {
        return res.status(400).json({ error: 'É necessário fornecer um termo de pesquisa.' });
    }

    const limit = req.query.limit || 100; // Limite padrão de resultados (até 100)

    // Consulta SQL para buscar animes que correspondem ao termo no título ou título alternativo
    const query = `
        SELECT a.*, e.*
        FROM animes AS a
        LEFT JOIN episodios AS e ON a.id = e.anime_id
        WHERE a.titulo LIKE '%' || ? || '%' OR a.tituloAlternativo LIKE '%' || ? || '%'
        LIMIT ?;
    `;
    
    db.all(query, [searchTerm, searchTerm, limit], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Erro ao buscar animes.' });
        }

        // Usar um objeto para armazenar os animes únicos e seus episódios
        const animeMap = {};

        rows.forEach(row => {
            const animeId = row.anime_id; // Usar anime_id para associar episódios ao anime correto

            // Verificar se o anime já está no mapa
            if (!animeMap[animeId]) {
                // Inicializar o objeto do anime
                animeMap[animeId] = {
                    id: row.anime_id, // Pode ser útil manter o id do anime aqui se necessário
                    capa: row.capa,
                    titulo: row.titulo,
                    tituloAlternativo: row.tituloAlternativo,
                    selo: row.selo,
                    sinopse: row.sinopse,
                    classificacao: row.classificacao,
                    status: row.status,
                    qntd_temporadas: row.qntd_temporadas,
                    anoLancamento: row.anoLancamento,
                    dataPostagem: row.dataPostagem,
                    ovas: row.ovas,
                    filmes: row.filmes,
                    estudio: row.estudio,
                    diretor: row.diretor,
                    genero: row.genero,
                    visualizacoes: row.visualizacoes,
                    tipoMidia: row.tipoMidia,
                    episodios: [] // Inicializa array para os episódios do anime
                };
            }

            // Adicionar o episódio ao anime correspondente
            animeMap[animeId].episodios.push({
                id: row.e_id,
                temporada: row.temporada,
                numero: row.numero,
                nome: row.nome,
                link: row.link,
                capa_ep: row.capa_ep
            });
        });

        // Converter o objeto em um array de objetos para enviar como resposta JSON
        const animes = Object.values(animeMap);

        // Ordenar os episódios de cada anime em ordem crescente pelo número do episódio
        animes.forEach(anime => {
            anime.episodios.sort((a, b) => a.numero - b.numero);
        });

        // Enviar a resposta JSON com os dados organizados
        res.json(animes);
    });
});

app.get('/animesRecentes', (req, res) => {
    // Passo 1: Obter os IDs dos animes que têm episódios
    const queryAnimeIdsWithEpisodes = `
        SELECT DISTINCT
            a.id
        FROM 
            animes a
        JOIN 
            episodios e ON a.id = e.anime_id
        WHERE
            a.dataPostagem IS NOT NULL
        ORDER BY 
            a.dataPostagem DESC
    `;

    db.all(queryAnimeIdsWithEpisodes, (error, animeIdsRows) => {
        if (error) {
            console.error('Erro ao selecionar os IDs dos animes com episódios:', error);
            return res.status(500).send('Erro ao selecionar os IDs dos animes com episódios do banco de dados.');
        }

        // Obter os primeiros 35 IDs dos animes mais recentes com episódios
        const animeIds = animeIdsRows.map(row => row.id).slice(0, 35);

        if (animeIds.length === 0) {
            return res.status(200).json([]);
        }

        // Passo 2: Obter os detalhes dos animes mais recentes com episódios
        const queryAnimes = `
            SELECT 
                a.id,
                a.capa,
                a.titulo,
                a.tituloAlternativo,
                a.selo,
                a.sinopse,
                a.genero,
                a.classificacao,
                a.status,
                a.qntd_temporadas,
                a.anoLancamento,
                a.dataPostagem,
                a.ovas,
                a.filmes,
                a.estudio,
                a.diretor,
                a.tipoMidia,
                a.visualizacoes
            FROM 
                animes a
            WHERE
                a.id IN (${animeIds.join(',')})
            ORDER BY 
                a.dataPostagem DESC
        `;

        db.all(queryAnimes, (error, animesRows) => {
            if (error) {
                console.error('Erro ao selecionar os dados dos animes:', error);
                return res.status(500).send('Erro ao selecionar os dados dos animes do banco de dados.');
            }

            // Passo 3: Obter todos os episódios desses animes
            const queryEpisodios = `
                SELECT 
                    e.id AS episodio_id,
                    e.temporada,
                    e.numero,
                    e.nome AS nome_episodio,
                    e.link,
                    e.capa_ep,
                    e.anime_id
                FROM 
                    episodios e
                WHERE
                    e.anime_id IN (${animeIds.join(',')})
            `;

            db.all(queryEpisodios, (error, episodiosRows) => {
                if (error) {
                    console.error('Erro ao selecionar os dados dos episódios:', error);
                    return res.status(500).send('Erro ao selecionar os dados dos episódios do banco de dados.');
                }

                // Mapear os episódios por anime
                const animesMap = animesRows.reduce((map, anime) => {
                    map[anime.id] = {
                        id: anime.id,
                        capa: anime.capa,
                        titulo: anime.titulo,
                        tituloAlternativo: anime.tituloAlternativo,
                        selo: anime.selo,
                        sinopse: anime.sinopse,
                        generos: anime.genero ? anime.genero.split(',') : [],
                        classificacao: anime.classificacao,
                        status: anime.status,
                        qntd_temporadas: anime.qntd_temporadas,
                        anoLancamento: anime.anoLancamento,
                        dataPostagem: anime.dataPostagem,
                        ovas: anime.ovas,
                        filmes: anime.filmes,
                        estudio: anime.estudio,
                        diretor: anime.diretor,
                        tipoMidia: anime.tipoMidia,
                        visualizacoes: anime.visualizacoes,
                        episodios: []
                    };
                    return map;
                }, {});

                // Adicionar episódios aos respectivos animes
                episodiosRows.forEach(episodio => {
                    if (animesMap[episodio.anime_id]) {
                        animesMap[episodio.anime_id].episodios.push({
                            id: episodio.episodio_id,
                            temporada: episodio.temporada,
                            numero: episodio.numero,
                            nome: episodio.nome_episodio,
                            link: episodio.link,
                            capa_ep: episodio.capa_ep
                        });
                    }
                });

                // Converte o objeto em um array
                const result = animeIds.map(id => animesMap[id]).filter(anime => anime.episodios.length > 0);

                res.status(200).json(result);
            });
        });
    });
});


app.get('/animes-lancados-hoje', (req, res) => {
    const hoje = new Date().toISOString().split('T')[0]; // Data atual no formato YYYY-MM-DD

    const query = `
        SELECT 
            a.id,
            a.capa,
            a.titulo,
            a.tituloAlternativo,
            a.selo,
            a.sinopse,
            a.genero,
            a.classificacao,
            a.status,
            a.qntd_temporadas,
            a.anoLancamento,
            a.dataPostagem,
            a.ovas,
            a.filmes,
            a.estudio,
            a.diretor,
            a.tipoMidia,
            e.temporada,
            e.numero,
            e.nome AS nome_episodio,
            e.link,
            e.capa_ep,
            a.visualizacoes AS visualizacoes
        FROM 
            animes a
        LEFT JOIN 
            episodios e ON a.id = e.anime_id
        WHERE 
            a.dataPostagem = ?;
    `;

    db.all(query, [hoje], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao buscar animes lançados hoje' });
            return;
        }

        // Organizar os dados em um formato mais adequado, se necessário
        const animesCompletos = {};

        rows.forEach(row => {
            if (!animesCompletos[row.id]) {
                animesCompletos[row.id] = {
                    id: row.id,
                    capa: row.capa,
                    titulo: row.titulo,
                    tituloAlternativo: row.tituloAlternativo,
                    selo: row.selo,
                    sinopse: row.sinopse,
                    genero: row.genero,
                    classificacao: row.classificacao,
                    status: row.status,
                    qntd_temporadas: row.qntd_temporadas,
                    anoLancamento: row.anoLancamento,
                    dataPostagem: row.dataPostagem,
                    ovas: row.ovas,
                    filmes: row.filmes,
                    estudio: row.estudio,
                    diretor: row.diretor,
                    tipoMidia: row.tipoMidia,
                    visualizacoes: row.visualizacoes,
                    episodios: []
                };
            }

            // Adicionar os episódios associados ao anime
            if (row.temporada && row.numero) {
                animesCompletos[row.id].episodios.push({
                    temporada: row.temporada,
                    numero: row.numero,
                    nome: row.nome_episodio,
                    link: row.link,
                    capa_ep: row.capa_ep
                });
            }
        });

        // Converter o objeto em um array de animes completos
        const result = Object.values(animesCompletos);

        res.json(result);
    });
});
app.post('/enviarAviso', (req, res) => {
    const { titulo, conteudo } = req.body;

    // Validação simples dos dados recebidos
    if (!titulo || !conteudo) {
        return res.status(400).json({ error: 'Título e conteúdo são obrigatórios.' });
    }

    // Verifica se já existe um aviso ativo
    db.get('SELECT id FROM avisos WHERE ativo = 1', (error, row) => {
        if (error) {
            console.error('Erro ao verificar aviso ativo:', error.message);
            return res.status(500).json({ error: 'Erro ao verificar aviso ativo no banco de dados.' });
        }

        if (row) {
            // Se existe um aviso ativo, atualiza-o
            const updateQuery = `
                UPDATE avisos
                SET titulo = ?,
                    conteudo = ?,
                    dataHoraPostagem = CURRENT_TIMESTAMP,
                    ativo = 1
                WHERE id = ?
            `;
            const updateValues = [titulo, conteudo, row.id];

            db.run(updateQuery, updateValues, function(updateError) {
                if (updateError) {
                    console.error('Erro ao atualizar aviso:', updateError.message);
                    return res.status(500).json({ error: 'Erro ao atualizar aviso no banco de dados.' });
                } 
                
                // Retorna o ID do aviso atualizado
                res.json({ id: row.id, titulo, conteudo });
            });
        } else {
            // Se não existe um aviso ativo, insere um novo
            const insertQuery = `
                INSERT INTO avisos (titulo, conteudo)
                VALUES (?, ?)
            `;
            const insertValues = [titulo, conteudo];

            db.run(insertQuery, insertValues, function(insertError) {
                if (insertError) {
                    console.error('Erro ao inserir aviso:', insertError.message);
                    return res.status(500).json({ error: 'Erro ao inserir aviso no banco de dados.' });
                }
                
                // Retorna o ID do aviso inserido
                res.json({ id: this.lastID, titulo, conteudo });
            });
        }
    });
});

app.post('/api/suporte', (req, res) => {
    const { usuario_id, tipo_report, descricao } = req.body;

    const sql = `INSERT INTO suporte (usuario_id, tipo_report, descricao)
                 VALUES (?, ?, ?)`;

    db.run(sql, [usuario_id, tipo_report, descricao], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            message: "Report inserido com sucesso!",
            report_id: this.lastID
        });
    });
});

// Rota para listar todos os reports de suporte
app.get('/api/suporte', (req, res) => {
    const sql = "SELECT * FROM suporte";
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            reports: rows
        });
    });
});

app.get('/avisoAtivo', (req, res) => {
    const query = `
        SELECT id, titulo, conteudo, dataHoraPostagem
        FROM avisos
        WHERE ativo = 1
    `;

    db.get(query, (error, row) => {
        if (error) {
            console.error('Erro ao selecionar aviso ativo:', error.message);
            return res.status(500).json({ error: 'Erro ao selecionar aviso ativo do banco de dados.' });
        }

        if (!row) {
            return res.status(404).json({ message: 'Nenhum aviso ativo encontrado.' });
        }

        res.json(row);
    });
});

function updateStatistics() {
    db.serialize(() => {
        // Consultar o total de animes
        db.get('SELECT COUNT(*) AS total_animes FROM animes', (err, row) => {
            if (err) {
                console.error('Erro ao consultar total de animes:', err);
                return;
            }
            const totalAnimes = row.total_animes;

            // Consultar o total de episódios
            db.get('SELECT COUNT(*) AS total_episodios FROM episodios', (err, row) => {
                if (err) {
                    console.error('Erro ao consultar total de episódios:', err);
                    return;
                }
                const totalEpisodios = row.total_episodios;

                // Atualizar a tabela de estatísticas
                db.run(`
                    INSERT INTO estatisticas (total_animes, total_episodios)
                    VALUES (?, ?)
                `, [totalAnimes, totalEpisodios], (err) => {
                    if (err) {
                        console.error('Erro ao atualizar estatísticas:', err);
                    } else {
                        console.log('Estatísticas atualizadas com sucesso');
                    }
                });
            });
        });
    });
}

function excluirSuportesAntigos() {
    const sql = `DELETE FROM suporte WHERE data_criacao <= datetime('now', '-30 days')`;

    db.run(sql, function(err) {
        if (err) {
            console.error("Erro ao excluir registros antigos:", err.message);
        } else {
            console.log(`Registros antigos excluídos: ${this.changes}`);
        }
    });
}


cron.schedule('0 0 * * *', () => {
    console.log('Atualizando estatísticas...');
    updateStatistics();
});

cron.schedule('0 0 */30 * *', () => {
    console.log('Executando limpeza de dados antigos...');
    excluirSuportesAntigos();
});

/// Iniciar o servidor
https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(`Servidor HTTPS está ouvindo na porta ${PORT}`);
});