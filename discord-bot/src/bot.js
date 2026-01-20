import { Client, GatewayIntentBits, Collection } from 'discord.js'
import dotenv from 'dotenv'
import { registerCommands } from './handlers/commandHandler.js'
import { handleInteraction } from './handlers/interactionHandler.js'
import convertCommand from './commands/convert.js'
import helpCommand from './commands/help.js'
import statusCommand from './commands/status.js'

dotenv.config()

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
})

// Coleção de comandos
client.commands = new Collection()
client.commands.set('convert', convertCommand)
client.commands.set('help', helpCommand)
client.commands.set('status', statusCommand)

// Mapa para rastrear conversões em andamento
client.activeConversions = new Map()

client.once('ready', async () => {
  console.log(`\n✅ Bot logado como ${client.user.tag}`)
  console.log(`🎯 ID do Client: ${client.user.id}`)
  console.log(`📊 Guilds: ${client.guilds.cache.size}`)

  // Definir status do bot
  client.user.setStatus('online')
  client.user.setActivity('📚 /convert - Converta PDF para EPUB', { type: 'WATCHING' })

  // Registrar comandos
  await registerCommands(client)
})

client.on('interactionCreate', async (interaction) => {
  try {
    await handleInteraction(interaction, client)
  } catch (error) {
    console.error('❌ Erro ao processar interação:', error)

    const errorMessage = {
      content: '❌ Erro ao processar comando. Tente novamente mais tarde.',
      ephemeral: true
    }

    if (interaction.isCommand() || interaction.isContextMenuCommand()) {
      if (interaction.replied) {
        await interaction.followUp(errorMessage)
      } else if (interaction.deferred) {
        await interaction.editReply(errorMessage)
      } else {
        await interaction.reply(errorMessage)
      }
    }
  }
})

client.on('error', error => {
  console.error('❌ Erro do cliente Discord:', error)
})

process.on('unhandledRejection', error => {
  console.error('❌ Promise rejection não tratada:', error)
})

client.login(process.env.DISCORD_BOT_TOKEN)
