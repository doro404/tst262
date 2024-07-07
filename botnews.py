
import requests
from telegram import Bot

# Token do seu bot obtido do BotFather
bot_token = '7316357488:AAHQbiCSpCqrDZgmfi25vJs2roXInS1aFCU'  # Substitua pelo seu token do BotFather

# ID do canal para onde a mensagem será enviada (deve começar com @ para canais públicos)
channel_id = '@canalontste0'  # Substitua pelo ID do seu canal

# Função para enviar uma mensagem para o canal no Telegram
def enviar_mensagem_no_canal(mensagem):
    bot = Bot(token=bot_token)
    bot.send_message(chat_id=channel_id, text=mensagem)

# Função para buscar e enviar detalhes dos animes lançados hoje
def enviar_detalhes_animes_lancados_hoje():
    try:
        # Realizar uma solicitação GET para a rota /animes-lancados-hoje da sua aplicação
        response = requests.get('https://saikanet.online:3000/animes-lancados-hoje')

        # Verificar se a resposta contém dados válidos
        if response.status_code == 200:
            data = response.json()

            # Verificar se os dados são uma lista
            if isinstance(data, list):
                # Iterar sobre os animes retornados
                for anime in data:
                    # Formatar a mensagem com os detalhes do anime
                    mensagem = f'📺 *Detalhes do Anime: {anime["titulo"]}*\n\n'
                    mensagem += f'*Título:* {anime["titulo"]}\n'
                    mensagem += f'*Selo:* {anime["selo"]}\n'
                    mensagem += f'*Sinopse:* {anime["sinopse"]}\n\n'
                    mensagem += 'Mais detalhes: Insira o link aqui'  # Substitua pelo link apropriado

                    # Enviar mensagem para o canal no Telegram
                    enviar_mensagem_no_canal(mensagem)

                print('Detalhes dos animes lançados hoje enviados com sucesso para o canal!')
            else:
                print('Resposta inválida da rota /animes-lancados-hoje:', data)
        else:
            print('Erro ao buscar detalhes dos animes lançados hoje:', response.status_code)
    except Exception as e:
        print('Erro ao buscar ou enviar detalhes dos animes lançados hoje:', str(e))

# Chamada da função para buscar e enviar detalhes dos animes lançados hoje
enviar_detalhes_animes_lancados_hoje()
