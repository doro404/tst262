


const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Token do seu bot obtido do BotFather
const botToken = '7316357488:AAHQbiCSpCqrDZgmfi25vJs2roXInS1aFCU'; // Substitua pelo seu token do BotFather

// ID do canal para onde a mensagem será enviada (deve começar com @ para canais públicos)
const channelId = '@canalontste0'; // Substitua pelo ID do seu canal

// Criação de um bot que usará o token fornecido
const bot = new TelegramBot(botToken, { polling: false }); // Não usar polling para tarefas automáticas

// Função para enviar uma mensagem para o canal no Telegram
function enviarMensagemNoCanal(mensagem) {
    bot.sendMessage(channelId, mensagem)
        .then(() => {
            console.log('Mensagem enviada com sucesso para o canal!');
        })
        .catch((error) => {
            console.error('Erro ao enviar mensagem:', error.message);
        });
}

// Função para buscar e enviar detalhes dos animes lançados hoje
async function enviarDetalhesAnimesLancadosHoje() {
    try {
        // Realizar uma solicitação GET para a rota /animes-lancados-hoje da sua aplicação Express
        const response = await axios.get('https://saikanet.online:3000/animes-lancados-hoje'); // Substitua pela URL correta da sua rota

        // Verificar se a resposta contém dados válidos
        if (response.data && Array.isArray(response.data)) {
            // Iterar sobre os animes retornados
            response.data.forEach(anime => {
                // Formatar a mensagem com os detalhes do anime
                let mensagem = `📺 *Detalhes do Anime: ${anime.titulo}*\n\n`;
                mensagem += `*Título:* ${anime.titulo}\n`;
                mensagem += `*Selo:* ${anime.selo}\n`;
                mensagem += `*Sinopse:* ${anime.sinopse}\n\n`;
                mensagem += `Mais detalhes: Insira o link aqui`; // Substitua pelo link apropriado

                // Enviar mensagem para o canal no Telegram
                enviarMensagemNoCanal(mensagem);
            });

            console.log('Detalhes dos animes lançados hoje enviados com sucesso para o canal!');
        } else {
            console.error('Resposta inválida da rota /animes-lancados-hoje:', response.data);
        }
    } catch (error) {
        console.error('Erro ao buscar ou enviar detalhes dos animes lançados hoje:', error.message);
    }
}

// Exemplo de uso da função para buscar e enviar detalhes dos animes lançados hoje
enviarDetalhesAnimesLancadosHoje();