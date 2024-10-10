# -- coding: utf-8 --

import asyncio
import requests
from telegram import Bot, InlineKeyboardMarkup, InlineKeyboardButton
import sqlite3
from datetime import datetime

# Token do seu bot obtido do BotFather
bot_token = '7316357488:AAHQbiCSpCqrDZgmfi25vJs2roXInS1aFCU'  # Substitua pelo seu token do BotFather

# IDs dos canais ou grupos para onde a mensagem será enviada (deve começar com @ para canais públicos)
chat_ids = ['@sousoanimes', '@sousoanimeschat']  # Substitua pelos IDs dos seus canais ou grupos

# URL base para assistir ao anime
assistir_url_base = 'https://animesonlinebr.fun/a?id='

# URL base para marcar alerta
marcar_alerta_url = 'https://saikanet.online:3000/marcar-alerta'

# Função assíncrona para enviar uma mensagem para múltiplos canais ou grupos no Telegram
async def enviar_mensagem_no_canal(mensagem, url_imagem, anime_id):
    bot = Bot(token=bot_token)

    # Criar o botão inline "Assista Aqui"
    button_text = 'Assista Aqui'
    button_url = f'{assistir_url_base}{anime_id}'
    keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton(button_text, url=button_url)]]
    )

    # Truncar a mensagem se for muito longa
    if len(mensagem) > 1024:
        mensagem = mensagem[:1000] + '...'

    # Enviar a mensagem e a foto para cada chat_id
    for chat_id in chat_ids:
        await bot.send_photo(chat_id=chat_id, photo=url_imagem, caption=mensagem, reply_markup=keyboard)

async def enviar_mensagem_no_canal_ep(mensagem, url_imagem, anime_id, episodio_numero):
    bot = Bot(token=bot_token)

    # Criar o botão inline "Assista Aqui"
    button_text = 'Assista Aqui'
    button_url = f'https://animesonlinebr.fun/d?id={anime_id}&ep={episodio_numero}'
    keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton(button_text, url=button_url)]]
    )

    # Truncar a mensagem se for muito longa
    if len(mensagem) > 1024:
        mensagem = mensagem[:1000] + '...'

    # Enviar a mensagem e a foto para cada chat_id
    for chat_id in chat_ids:
        await bot.send_photo(chat_id=chat_id, photo=url_imagem, caption=mensagem, reply_markup=keyboard)

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

# Configurar o banco de dados SQLite
def configurar_banco_de_dados():
    conn = sqlite3.connect('animes.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS animes_enviados (
            id TEXT PRIMARY KEY,
            data_envio TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS episodios_enviados (
            id INTEGER PRIMARY KEY,
            anime_id INTEGER,
            episodio INTEGER,
            data_envio TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

# Verificar se o anime já foi enviado
def anime_ja_enviado(anime_id):
    conn = sqlite3.connect('animes.db')
    cursor = conn.cursor()
    cursor.execute('SELECT 1 FROM animes_enviados WHERE id = ?', (anime_id,))
    result = cursor.fetchone()
    conn.close()
    return result is not None

# Marcar o anime como enviado
def marcar_anime_como_enviado(anime_id):
    conn = sqlite3.connect('animes.db')
    cursor = conn.cursor()
    cursor.execute('INSERT INTO animes_enviados (id, data_envio) VALUES (?, ?)', (anime_id, datetime.now()))
    conn.commit()
    conn.close()

# Verificar se o episódio já foi enviado
def episodio_ja_enviado(episodio_id):
    conn = sqlite3.connect('animes.db')
    cursor = conn.cursor()
    cursor.execute('SELECT 1 FROM episodios_enviados WHERE id = ?', (episodio_id,))
    result = cursor.fetchone()
    conn.close()
    return result is not None

# Marcar o episódio como enviado
def marcar_episodio_como_enviado(episodio_id, anime_id, episodio):
    conn = sqlite3.connect('animes.db')
    cursor = conn.cursor()
    cursor.execute('INSERT INTO episodios_enviados (id, anime_id, episodio, data_envio) VALUES (?, ?, ?, ?)', 
                   (episodio_id, anime_id, episodio, datetime.now()))
    conn.commit()
    conn.close()

# Função para chamar a rota /marcar-alerta
def marcar_alerta(anime_id, episodio_numero):
    try:
        response = requests.post(marcar_alerta_url, json={
            'anime_id': anime_id,
            'numero': episodio_numero
        })
        if response.status_code == 200:
            print(f'Alerta marcado com sucesso para anime_id {anime_id}, episódio {episodio_numero}.')
        else:
            print(f'Erro ao marcar alerta: {response.status_code}')
    except Exception as e:
        print(f'Erro ao marcar alerta: {str(e)}')

# Função assíncrona para enviar um episódio com atraso
async def enviar_mensagem_no_canal_ep_com_atraso(mensagem, url_imagem, anime_id, episodio_numero, delay=2):
    # Enviar a mensagem para o episódio
    await enviar_mensagem_no_canal_ep(mensagem, url_imagem, anime_id, episodio_numero)
    
    # Introduzir um atraso de 'delay' segundos entre os envios
    await asyncio.sleep(delay)

async def enviar_detalhes_animes_lancados_hoje():
    try:
        response = requests.get('https://saikanet.online:3000/animes-lancados-hoje')
        print(f"URL chamada: {response.url}")
        print(f"Status Code: {response.status_code}")
        print(f"Conteúdo da resposta: {response.text}")

        if response.status_code == 200:
            data = response.json()

            if 'animesCompletos' in data and 'episodiosNovos' in data:
                tarefas = []

                for anime in data['animesCompletos']:
                    anime_id = anime['id']
                    
                    # Verificar se o anime já foi enviado
                    if anime_ja_enviado(anime_id):
                        print(f"Anime {anime_id} já foi enviado, pulando...")
                        continue  # Pular para o próximo anime

                    imagem = baixar_imagem(anime.get('capa', ''))
                    if imagem:
                        mensagem = (
                            f'📺 Detalhes do Anime: {anime.get("titulo", "Desconhecido")}\n\n'
                            f'🎬 Título: {anime.get("titulo", "Desconhecido")}\n'
                            f'🏷️ Selo: {anime.get("selo", "Desconhecido")}\n'
                            f'🎨 Estúdio: {anime.get("estudio", "Desconhecido")}\n'
                            f'📅 Data de Postagem: {anime.get("dataPostagem", "Desconhecida")}\n'
                            f'🎭 Gênero: {anime.get("genero", "Desconhecido")}\n'
                            f'🔞 Classificação: {anime.get("classificacao", "Desconhecida")}\n'
                            f'📅 Ano de Lançamento: {anime.get("anoLancamento", "Desconhecido")}\n\n'
                            f'📝 Sinopse: {anime.get("sinopse", "Desconhecida")}\n\n'
                        )

                        # Adicionar o anime à lista de tarefas para envio
                        tarefas.append(enviar_mensagem_no_canal(mensagem, imagem, anime_id))

                        # Marcar o anime como enviado no banco de dados
                        marcar_anime_como_enviado(anime_id)

                for episodio in data['episodiosNovos']:
                    anime = episodio.get('anime', {})
                    anime_id = anime.get('id', None)
                    episodio_numero = episodio.get('numero', "Desconhecido")
                    
                    # Verificar se o episódio já foi enviado
                    episodio_id = f"{anime_id}-{episodio_numero}"
                    if episodio_ja_enviado(episodio_id):
                        print(f"Episódio {episodio_numero} do anime {anime_id} já foi enviado, pulando...")
                        continue  # Pular para o próximo episódio

                    imagem_ep = baixar_imagem(episodio.get('capa_ep', ''))
                    if imagem_ep:
                        link_ep = f'https://animesonlinebr.fun/d?id={anime_id}&ep={episodio_numero}'
                        data_atual = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                        mensagem_ep = (
                            f'🔔 Novo Episódio Disponível\n\n'
                            f'🎬 Título do Anime: {anime.get("titulo", "Desconhecido")}\n'
                            f'🎬 Episódio: {episodio_numero}\n'
                            f'📅 Data: {data_atual}\n\n'
                            f'🎥 Assista aqui: {link_ep}\n'
                        )

                        # Adicionar o episódio à lista de tarefas para envio, com atraso entre os envios
                        tarefas.append(enviar_mensagem_no_canal_ep_com_atraso(mensagem_ep, imagem_ep, anime_id, episodio_numero, delay=5))

                        # Marcar o episódio como enviado no banco de dados
                        marcar_episodio_como_enviado(episodio_id, anime_id, episodio_numero)

                        # Marcar alerta para o episódio
                        marcar_alerta(anime_id, episodio_numero)

                # Aguardar todas as mensagens serem enviadas, incluindo os atrasos
                await asyncio.gather(*tarefas)

            else:
                print('Resposta JSON não contém "animesCompletos" ou "episodiosNovos".')
        else:
            print(f'Erro na requisição: {response.status_code}')
    except Exception as e:
        print(f'Erro ao enviar detalhes dos animes: {str(e)}')

# Função principal
def main():
    configurar_banco_de_dados()  # Configurar o banco de dados na inicialização
    loop = asyncio.get_event_loop()  # Obter o loop de eventos
    loop.run_until_complete(enviar_detalhes_animes_lancados_hoje())  # Executar a função assíncrona

if __name__ == '__main__':
    main()
