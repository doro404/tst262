

# -- coding: utf-8 --

import asyncio
import requests
from telegram import Bot, InlineKeyboardMarkup, InlineKeyboardButton
from datetime import datetime, timedelta
import random

# Token do seu bot obtido do BotFather
bot_token = '7316357488:AAHQbiCSpCqrDZgmfi25vJs2roXInS1aFCU'  # Substitua pelo seu token do BotFather

# ID do canal para onde a mensagem será enviada (deve começar com @ para canais públicos)
channel_id = '@sousoanimes'  # Substitua pelo ID do seu canal

# URL base para assistir ao anime
assistir_url_base = 'https://animesonlinebr.fun/a?id='

# Lista para armazenar IDs de animes já enviados
animes_enviados = set()

# Função assíncrona para enviar uma mensagem para o canal no Telegram
async def enviar_mensagem_no_canal(mensagem, url_imagem, anime_id):
    bot = Bot(token=bot_token)

    # Criar o botão inline "Assista Aqui"
    button_text = 'Assista Aqui'
    button_url = f'{assistir_url_base}{anime_id}'
    keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton(button_text, url=button_url)]]
    )

    # Enviar foto com a mensagem e o botão inline
    await bot.send_photo(chat_id=channel_id, photo=url_imagem, caption=mensagem, reply_markup=keyboard)

# Função para baixar a imagem de capa
def baixar_imagem(url):
    try:
        response = requests.get(url)
        if response.status_code == 200:
            return response.content  # Retorna o conteúdo da imagem como bytes
        else:
            print(f'Erro ao baixar imagem: {response.status_code}')
            return None
    except Exception as e:
        print(f'Erro ao baixar imagem: {str(e)}')
        return None

# Função para buscar e enviar detalhes dos animes lançados hoje
async def enviar_detalhes_animes_lancados_hoje():
    global animes_enviados  # Acessar a variável global animes_enviados

    try:
        # Realizar uma solicitação GET para a rota /animes-lancados-hoje da sua aplicação
        response = requests.get('https://saikanet.online:3000/animes-lancados-hoje')

        # Verificar se a resposta contém dados válidos
        if response.status_code == 200:
            data = response.json()

            # Verificar se os dados são uma lista
            if isinstance(data, list) and len(data) > 0:
                print(f'Encontrados {len(data)} catálogos lançados hoje.')

                # Calcular intervalos de envio baseado no número de catálogos
                intervalo_minutos = calcular_intervalo(len(data))

                # Iterar sobre os animes retornados
                for anime in data:
                    anime_id = anime['id']

                    # Verificar se o anime já foi enviado anteriormente
                    if anime_id not in animes_enviados:
                        # Baixar a imagem de capa
                        imagem = baixar_imagem(anime['capa'])
                        if imagem:
                            # Formatar a mensagem com os detalhes do anime e o link da capa
                            mensagem = (
                                f'📺 Detalhes do Anime: {anime["titulo"]}\n\n'
                                f'🎬 Título: {anime["titulo"]}\n'
                                f'🏷️ Selo: {anime["selo"]}\n'
                                f'🎨 Estúdio: {anime["estudio"]}\n'
                                f'📅 Data de Postagem: {anime["dataPostagem"]}\n'
                                f'🎭 Gênero: {anime["genero"]}\n'
                                f'🔞 Classificação: {anime["classificacao"]}\n'
                                f'📅 Ano de Lançamento: {anime["anoLancamento"]}\n\n'
                                f'📝 Sinopse: {anime["sinopse"]}\n\n'
                            )

                            # Enviar mensagem após um atraso calculado
                            await asyncio.sleep(intervalo_minutos * 60)
                            await enviar_mensagem_no_canal(mensagem, imagem, anime_id)

                            # Adicionar o ID do anime à lista de enviados
                            animes_enviados.add(anime_id)

                            print(f'Enviando catálogo: {anime["titulo"]} - ID: {anime_id}')
                    else:
                        print(f'Anime já enviado anteriormente: {anime["titulo"]} - ID: {anime_id}')

                print('Detalhes dos animes lançados hoje enviados com sucesso para o canal!')
            else:
                print('Nenhum anime lançado hoje ou resposta inválida da rota /animes-lancados-hoje:', data)
        else:
            print('Erro ao buscar detalhes dos animes lançados hoje:', response.status_code)
    except Exception as e:
        print('Erro ao buscar ou enviar detalhes dos animes lançados hoje:', str(e))

# Função para calcular o intervalo dinâmico baseado no número de catálogos
def calcular_intervalo(num_catologos):
    # Definir um intervalo base mínimo (em minutos)
    intervalo_base = 30  # Por exemplo, iniciar com um intervalo de 30 minutos

    # Ajustar o intervalo conforme o número de catálogos
    intervalo_minutos = max(intervalo_base / num_catologos, 5)  # Intervalo mínimo de 5 minutos

    return intervalo_minutos

# Função principal para iniciar o processo
async def main():
    while True:
        agora = datetime.now()
        # Verificar se é um novo dia (resetar envios enviados)
        if agora.hour == 0 and agora.minute == 0:
            animes_enviados.clear()
            print('Resetando lista de animes enviados.')

        # Verificar se é um horário para enviar os detalhes dos animes lançados hoje
        if agora.hour == 8 and agora.minute == 0:  # Exemplo: Enviar todos os dias às 08:00
            await enviar_detalhes_animes_lancados_hoje()
            print('Programado envio dos detalhes dos animes lançados hoje.')

        # Aguardar 1 minuto antes de verificar novamente
        await asyncio.sleep(60)

# Iniciar o processo
if __name__ == '__main__':
    asyncio.run(main())
