# -- coding: utf-8 --

import asyncio
import requests
from telegram import Bot, InlineKeyboardMarkup, InlineKeyboardButton
import sqlite3
from datetime import datetime

# Token do seu bot obtido do BotFather
bot_token = '7316357488:AAHQbiCSpCqrDZgmfi25vJs2roXInS1aFCU'  # Substitua pelo seu token do BotFather

# ID do canal para onde a mensagem será enviada (deve começar com @ para canais públicos)
channel_id = '@sousoanimes'  # Substitua pelo ID do seu canal

# URL base para assistir ao anime
assistir_url_base = 'https://animesonlinebr.fun/a?id='

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

# Função para buscar e enviar detalhes dos animes lançados hoje
async def enviar_detalhes_animes_lancados_hoje():
    try:
        # Realizar uma solicitação GET para a rota /animes-lancados-hoje da sua aplicação
        response = requests.get('https://saikanet.online:3000/animes-lancados-hoje')

        # Verificar se a resposta contém dados válidos
        if response.status_code == 200:
            data = response.json()

            # Verificar se os dados são uma lista
            if isinstance(data, list):
                tarefas = []
                # Iterar sobre os animes retornados
                for anime in data:
                    anime_id = anime['id']

                    # Verificar se o anime já foi enviado anteriormente
                    if not anime_ja_enviado(anime_id):
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

                            # Marcar o anime como enviado
                            marcar_anime_como_enviado(anime_id)
                
                # Executar todas as tarefas de envio simultaneamente
                await asyncio.gather(*tarefas)

                print('Detalhes dos animes lançados hoje enviados com sucesso para o canal!')
            else:
                print('Resposta inválida da rota /animes-lancados-hoje:', data)
        else:
            print('Erro ao buscar detalhes dos animes lançados hoje:', response.status_code)
    except Exception as e:
        print('Erro ao buscar ou enviar detalhes dos animes lançados hoje:', str(e))

# Função principal para iniciar o processo
async def main():
    print('Iniciando verificação imediata dos animes lançados hoje...')
    await enviar_detalhes_animes_lancados_hoje()
    print('Verificação imediata concluída.')
    
    while True:
        await enviar_detalhes_animes_lancados_hoje()
        # Esperar por uma hora antes de verificar novamente
        await asyncio.sleep(3600)

if __name__ == '__main__':
    configurar_banco_de_dados()
    asyncio.run(main())
