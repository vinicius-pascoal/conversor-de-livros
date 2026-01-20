import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('📊 Mostra informações e estatísticas do bot'),

  async execute(interaction) {
    const uptime = process.uptime()
    const hours = Math.floor(uptime / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    const seconds = Math.floor(uptime % 60)

    const activeConversions = interaction.client.activeConversions.size
    const totalGuilds = interaction.client.guilds.cache.size
    const totalUsers = interaction.client.users.cache.size

    const statusEmbed = new EmbedBuilder()
      .setColor('#10b981')
      .setTitle('📊 Status do Bot')
      .setThumbnail(interaction.client.user.displayAvatarURL())
      .addFields(
        {
          name: '🟢 Status',
          value: 'Online',
          inline: true
        },
        {
          name: '⏱️ Uptime',
          value: `${hours}h ${minutes}m ${seconds}s`,
          inline: true
        },
        {
          name: '🔄 Conversões Ativas',
          value: `${activeConversions}`,
          inline: true
        },
        {
          name: '🏠 Servidores',
          value: `${totalGuilds}`,
          inline: true
        },
        {
          name: '👥 Usuários',
          value: `${totalUsers}`,
          inline: true
        },
        {
          name: '💾 Memória',
          value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB / ${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
          inline: true
        }
      )
      .setFooter({
        text: `Solicitado por ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL()
      })
      .setTimestamp()

    await interaction.reply({ embeds: [statusEmbed], ephemeral: false })
  }
}
