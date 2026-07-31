'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('頂樓傳送門')
  .setDescription('快速傳送到頂樓的通道');

async function execute(interaction) {
  if (!interaction.inGuild() || !interaction.guildId || !interaction.channelId) {
    await interaction.reply({
      content: '❌ 此指令只能在伺服器頻道內使用。',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const topUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.channelId}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🚪 前往本頻道頂樓')
      .setStyle(ButtonStyle.Link)
      .setURL(topUrl)
  );

  await interaction.reply({
    content:
      '## 🌸 頂樓傳送門\n點擊下方按鈕即可快速返回本頻道頂樓。',
    components: [row]
  });
}

module.exports = {
  data,
  execute
};