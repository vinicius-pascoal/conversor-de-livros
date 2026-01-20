import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('📚 Mostra informações de ajuda sobre os comandos'),

  async execute(interaction) {
    const helpEmbed = new EmbedBuilder()
      .setColor('#DD6600')
      .setTitle('📚 Conversor PDF para EPUB - Ajuda')
      .setDescription('Bot para converter arquivos PDF para EPUB no Discord')
      .addFields(
        {
          name: '📖 /convert',
          value: 'Converte um PDF para EPUB\n\n**Opções:**\n' +
            '• `pdf` (obrigatório): Arquivo PDF para converter\n' +
            '• `capa` (opcional): Imagem de capa em JPG ou PNG\n' +
            '• `modo` (opcional): ⚡ Rápido ou 📖 Completo\n' +
            '• `traduzir` (opcional): Traduzir para português',
          inline: false
        },
        {
          name: '⚡ Modos de Conversão',
          value: '**Rápido**: Converte todo o conteúdo em um único capítulo (mais rápido)\n' +
            '**Completo**: Cria capítulos automáticos (mais estruturado)',
          inline: false
        },
        {
          name: '📊 Limites',
          value: '• Tamanho máximo de PDF: 8MB\n' +
            '• Tamanho máximo de capa: 5MB\n' +
            '• Uma conversão por usuário por vez',
          inline: false
        },
        {
          name: '🌐 Idiomas',
          value: 'O bot detecta automaticamente o idioma do PDF e pode traduzir para português se solicitado',
          inline: false
        },
        {
          name: '❓ Exemplos de Uso',
          value: '```\n/convert pdf:documento.pdf\n' +
            '/convert pdf:livro.pdf capa:capa.png modo:full\n' +
            '/convert pdf:novel.pdf traduzir:true\n```',
          inline: false
        }
      )
      .setFooter({
        text: 'Dúvidas? Contacte o desenvolvedor',
        iconURL: interaction.user.displayAvatarURL()
      })
      .setTimestamp()

    await interaction.reply({ embeds: [helpEmbed], ephemeral: true })
  }
}
