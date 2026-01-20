import { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } from 'discord.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { convertPdfToEpub } from '../services/converter.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const servicesPath = path.join(__dirname, '../services')

// Importar dinamicamente o conversor
async function getConverter() {
  const { convertPdfToEpub: converter } = await import(path.join(servicesPath, 'converter.js'))
  return converter
}

export default {
  data: new SlashCommandBuilder()
    .setName('convert')
    .setDescription('🔄 Converte um arquivo PDF para EPUB')
    .addAttachmentOption(option =>
      option
        .setName('pdf')
        .setDescription('📄 Arquivo PDF para converter')
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option
        .setName('capa')
        .setDescription('🖼️ Imagem de capa (JPG ou PNG) - opcional')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('modo')
        .setDescription('⚡ Modo de conversão')
        .addChoices(
          { name: '⚡ Rápido (um capítulo)', value: 'fast' },
          { name: '📖 Completo (múltiplos capítulos)', value: 'full' }
        )
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('traduzir')
        .setDescription('🌐 Traduzir para português?')
        .setRequired(false)
    ),

  async execute(interaction) {
    const userId = interaction.user.id
    const converter = await getConverter()

    // Verificar se o usuário já tem uma conversão em andamento
    if (interaction.client.activeConversions.has(userId)) {
      return await interaction.reply({
        content: '⏳ Você já tem uma conversão em andamento! Aguarde a conclusão.',
        ephemeral: true
      })
    }

    await interaction.deferReply()

    const pdfAttachment = interaction.options.getAttachment('pdf')
    const coverAttachment = interaction.options.getAttachment('capa')
    const mode = interaction.options.getString('modo') || 'fast'
    const translate = interaction.options.getBoolean('traduzir') || false

    try {
      // Validação do PDF
      if (!pdfAttachment.name.toLowerCase().endsWith('.pdf')) {
        return await interaction.editReply('❌ O arquivo deve ser um PDF válido!')
      }

      if (pdfAttachment.size > 8 * 1024 * 1024) {
        return await interaction.editReply('❌ Arquivo muito grande! Máximo: 8MB')
      }

      // Validação da capa (se fornecida)
      let coverPath = null
      if (coverAttachment) {
        const validImageTypes = ['image/jpeg', 'image/png', 'image/jpg']
        if (!validImageTypes.includes(coverAttachment.type)) {
          return await interaction.editReply('❌ Capa deve ser JPG ou PNG!')
        }
        if (coverAttachment.size > 5 * 1024 * 1024) {
          return await interaction.editReply('❌ Capa muito grande! Máximo: 5MB')
        }
      }

      // Criar diretório temporário se não existir
      const tempDir = process.env.TEMP_DIR || './temp'
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }

      // Download do PDF
      await interaction.editReply('📥 Baixando arquivo PDF...')
      const pdfResponse = await fetch(pdfAttachment.url)
      const pdfBuffer = await pdfResponse.arrayBuffer()
      const timestamp = Date.now()
      const pdfPath = path.join(tempDir, `${timestamp}-${pdfAttachment.name}`)
      const epubPath = pdfPath.replace('.pdf', '.epub')

      fs.writeFileSync(pdfPath, Buffer.from(pdfBuffer))

      // Download da capa se fornecida
      if (coverAttachment) {
        const coverResponse = await fetch(coverAttachment.url)
        const coverBuffer = await coverResponse.arrayBuffer()
        coverPath = path.join(tempDir, `${timestamp}-cover.png`)
        fs.writeFileSync(coverPath, Buffer.from(coverBuffer))
      }

      // Marca conversão como ativa
      interaction.client.activeConversions.set(userId, {
        pdfName: pdfAttachment.name,
        startTime: Date.now()
      })

      // Callback de progresso
      let lastUpdate = Date.now()
      const progressCallback = async (data) => {
        const now = Date.now()
        if (now - lastUpdate > 8000) {
          const embed = new EmbedBuilder()
            .setColor('#DD6600')
            .setTitle('⏳ Conversão em Andamento')
            .setDescription(data.message || 'Processando...')
            .setFooter({ text: 'Aguarde...' })
            .setTimestamp()

          try {
            await interaction.editReply({ embeds: [embed] })
          } catch (e) {
            console.log('⚠️ Não foi possível atualizar mensagem de progresso')
          }
          lastUpdate = now
        }
      }

      // Realizar conversão
      await interaction.editReply({
        content: '🔄 Convertendo PDF para EPUB...',
        embeds: []
      })

      const elapsedStart = Date.now()
      await converter(pdfPath, epubPath, pdfAttachment.name, {
        fastMode: mode === 'fast',
        translate,
        coverPath,
        keepImages: true,
        progress: progressCallback
      })
      const elapsedTime = ((Date.now() - elapsedStart) / 1000).toFixed(2)

      // Verificar se o arquivo EPUB foi criado
      if (!fs.existsSync(epubPath)) {
        throw new Error('Arquivo EPUB não foi gerado corretamente')
      }

      // Verificar tamanho do EPUB
      const epubSize = fs.statSync(epubPath).size
      if (epubSize > 8 * 1024 * 1024) {
        fs.unlinkSync(epubPath)
        fs.unlinkSync(pdfPath)
        if (coverPath) fs.unlinkSync(coverPath)
        interaction.client.activeConversions.delete(userId)

        return await interaction.editReply(
          '❌ Arquivo EPUB resultante é muito grande para ser enviado (máx 8MB)'
        )
      }

      // Enviar EPUB
      const epubFile = new AttachmentBuilder(epubPath, {
        name: pdfAttachment.name.replace('.pdf', '.epub')
      })

      const successEmbed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle('✅ Conversão Concluída!')
        .addFields(
          { name: '📄 Arquivo Original', value: pdfAttachment.name, inline: true },
          { name: '⏱️ Tempo de Conversão', value: `${elapsedTime}s`, inline: true },
          { name: '📊 Modo', value: mode === 'fast' ? '⚡ Rápido' : '📖 Completo', inline: true },
          { name: '🌐 Tradução', value: translate ? 'Sim (PT-BR)' : 'Não', inline: true },
          { name: '📦 Tamanho EPUB', value: `${(epubSize / 1024).toFixed(2)} KB`, inline: true }
        )
        .setFooter({ text: `Solicitado por ${interaction.user.username}` })
        .setTimestamp()

      await interaction.editReply({
        content: '✅ EPUB pronto para download!',
        embeds: [successEmbed],
        files: [epubFile]
      })

      // Cleanup
      fs.unlinkSync(pdfPath)
      fs.unlinkSync(epubPath)
      if (coverPath && fs.existsSync(coverPath)) {
        fs.unlinkSync(coverPath)
      }
      interaction.client.activeConversions.delete(userId)

      console.log(`✅ Conversão concluída para ${interaction.user.tag}: ${pdfAttachment.name}`)

    } catch (error) {
      console.error('❌ Erro na conversão:', error)

      // Cleanup em caso de erro
      interaction.client.activeConversions.delete(userId)

      const errorEmbed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('❌ Erro na Conversão')
        .setDescription(`\`\`\`${error.message.substring(0, 200)}\`\`\``)
        .setFooter({ text: 'Tente novamente' })
        .setTimestamp()

      await interaction.editReply({ embeds: [errorEmbed] })
    }
  }
}
