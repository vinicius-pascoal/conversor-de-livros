import { REST, Routes } from 'discord.js'

export async function registerCommands(client) {
  try {
    console.log('🔄 Registrando comandos de slash...')

    const commands = []
    for (const [name, command] of client.commands) {
      commands.push(command.data.toJSON())
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN)

    // Se DISCORD_GUILD_ID estiver definido, registrar apenas no guild (testes rápidos)
    if (process.env.DISCORD_GUILD_ID) {
      console.log(`📍 Registrando comandos no guild: ${process.env.DISCORD_GUILD_ID}`)
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
        { body: commands }
      )
      console.log('✅ Comandos registrados no guild!')
    } else {
      // Registrar globalmente
      console.log('🌍 Registrando comandos globalmente...')
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: commands }
      )
      console.log('✅ Comandos registrados globalmente!')
      console.log('⏳ Pode levar até 1 hora para aparecer em todos os servidores')
    }
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error)
  }
}
