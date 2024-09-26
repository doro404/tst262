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
        response = requests.put(marcar_alerta_url, json={
            'anime_id': anime_id,
            'numero': episodio_numero
        })
        if response.status_code == 200:
            print(f'Alerta marcado com sucesso para anime_id {anime_id}, episódio {episodio_numero}.')
        else:
            print(f'Erro ao marcar alerta: {response.status_code}')
    except Exception as e:
        print(f'Erro ao marcar alerta: {str(e)}')

# Função para buscar e enviar detalhes dos animes lançados hoje
import requests
import asyncio

async def enviar_detalhes_animes_lancados_hoje():
    try:
        # Realizar uma solicitação GET para a rota /animes-lancados-hoje da sua aplicação
        response = requests.get('https://saikanet.online:3000/animes-lancados-hoje')

        # Verificar e imprimir detalhes da resposta para depuração
        print(f"URL chamada: {response.url}")
        print(f"Status Code: {response.status_code}")
        print(f"Conteúdo da resposta: {response.text}")

        # Verificar se a resposta contém dados válidos
        if response.status_code == 200:
            data = response.json()

            # Verificar se os dados têm as chaves esperadas
            if 'animesCompletos' in data and 'episodiosNovos' in data:
                tarefas = []

                # Processar animes completos
                for anime in data['animesCompletos']:
                    anime_id = anime['id']
                    
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

                        # Adicionar a tarefa de envio ao array de tarefas
                        tarefas.append(enviar_mensagem_no_canal(mensagem, imagem, anime_id))

                # Processar episódios novos
                for episodio in data['episodiosNovos']:
                    anime = episodio['anime']
                    anime_id = anime['id']

                    # Baixar a imagem de capa do episódio
                    imagem_ep = baixar_imagem(episodio['capa_ep'])
                    if imagem_ep:
                        # Formatar a mensagem com os detalhes do episódio
                        mensagem = (
                            f'🎥 Novo Episódio: {episodio["nome"]}\n\n'
                            f'📺 Anime: {anime["titulo"]}\n'
                            f'🎬 Episódio: {episodio["numero"]}\n'
                            f'🔗 Link: {episodio["link"]}\n'
                            f'📅 Data de Postagem: {episodio["dataPostagem"]}\n\n'
                        )

                        # Adicionar a tarefa de envio ao array de tarefas
                        tarefas.append(enviar_mensagem_no_canal(mensagem, imagem_ep, anime_id))

                # Executar todas as tarefas de envio simultaneamente
                await asyncio.gather(*tarefas)

                print('Detalhes dos animes e episódios enviados com sucesso para os canais!')
            else:
                print('Resposta inválida da rota /animes-lancados-hoje: Dados ausentes ou mal formatados')
        else:
            print('Erro ao buscar detalhes dos animes lançados hoje:', response.status_code)
    except Exception as e:
        print('Erro ao buscar ou enviar detalhes dos animes lançados hoje:', str(e))


# Função para buscar e enviar detalhes dos episódios novos
async def enviar_detalhes_episodios_novos():
    try:
        # Realizar uma solicitação GET para a rota /episodios-novos da sua aplicação
        response = requests.get('https://saikanet.online:3000/episodios-novos')

        # Verificar se a resposta contém dados válidos
        if response.status_code == 200:
            data = response.json()

            # Verificar se os dados são um dicionário
            if isinstance(data, dict) and 'episodios' in data:
                tarefas = []
                # Iterar sobre os episódios retornados
                for episodio in data['episodios']:
                    episodio_id = episodio['id']
                    anime_id = episodio['anime_id']
                    episodio_numero = episodio['numero']

                    # Verificar se o episódio já foi enviado anteriormente
                    if not episodio_ja_enviado(episodio_id):
                        # Baixar a imagem de capa
                        imagem = baixar_imagem(episodio.get('capa_ep', ''))
                        if imagem:
                            # Formatar a mensagem com os detalhes do episódio
                            mensagem = (
                                f'🎬 Novo Episódio: {episodio["descricao"]}\n\n'
                                f'📺 Anime: {anime_id}\n'
                                f'📅 Temporada: {episodio["temporada"]}\n'
                                f'🆚 Episódio: {episodio_numero}\n'
                                f'🔗 Link: {episodio["link"]}\n\n'
                            )

                            # Adicionar a tarefa de envio ao array de tarefas
                            tarefas.append(enviar_mensagem_no_canal(mensagem, imagem, anime_id))

                            # Marcar o episódio como enviado
                            marcar_episodio_como_enviado(episodio_id, anime_id, episodio_numero)
                            
                            # Chamar a rota /marcar-alerta
                            marcar_alerta(anime_id, episodio_numero)
                
                # Executar todas as tarefas de envio simultaneamente
                await asyncio.gather(*tarefas)

                print('Detalhes dos episódios novos enviados com sucesso para os canais!')
            else:
                print('Resposta inválida da rota /episodios-novos:', data)
        else:
            print('Erro ao buscar detalhes dos episódios novos:', response.status_code)
    except Exception as e:
        print('Erro ao buscar ou enviar detalhes dos episódios novos:', str(e))

# Função principal para iniciar o processo
async def main():
    print('Iniciando verificação imediata dos animes lançados hoje e episódios novos...')
    await enviar_detalhes_animes_lancados_hoje()
    await enviar_detalhes_episodios_novos()
    print('Verificação imediata concluída.')
    
    while True:
        await enviar_detalhes_animes_lancados_hoje()
        await enviar_detalhes_episodios_novos()
        # Esperar por uma hora antes de verificar novamente
        await asyncio.sleep(3600)

if __name__ == '__main__':
    configurar_banco_de_dados()
    asyncio.run(main())
