export async function handleInteraction(interaction, client) {
  if (!interaction.isChatInputCommand()) return

  console.log(`\n📨 Comando recebido: /${interaction.commandName} de ${interaction.user.tag}`)

  const command = client.commands.get(interaction.commandName)

  if (!command) {
    console.warn(`⚠️ Comando desconhecido: ${interaction.commandName}`)
    return await interaction.reply({
      content: '❌ Comando não encontrado!',
      ephemeral: true
    })
  }

  try {
    await command.execute(interaction)
  } catch (error) {
    console.error(`❌ Erro ao executar comando /${interaction.commandName}:`, error)

    const errorReply = {
      content: '❌ Ocorreu um erro ao executar o comando. Tente novamente mais tarde.',
      ephemeral: true
    }

    if (interaction.replied) {
      await interaction.followUp(errorReply)
    } else if (interaction.deferred) {
      await interaction.editReply(errorReply)
    } else {
      await interaction.reply(errorReply)
    }
  }
}
