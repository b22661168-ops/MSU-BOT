require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');

async function execute(message) {
  const target = message.mentions.users.first();

  // 沒有 @ 人
  if (!target) {
    return message.reply('👅 你要舔誰？');
  }

  // 圖片資料夾
  const imageFolder = path.join(__dirname, '..', 'images', 'lick');

  // 自動讀取所有圖片 / GIF
  const images = fs.readdirSync(imageFolder).filter(file =>
    /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
  );

  if (images.length === 0) {
    return message.reply('❌ 找不到任何舔舔圖片。');
  }

  // 隨機抽一張
  const fileName = images[Math.floor(Math.random() * images.length)];

  const attachment = new AttachmentBuilder(
    path.join(imageFolder, fileName),
    { name: fileName }
  );

  const embed = new EmbedBuilder()
    .setDescription(
      `### ${message.author} 輕輕舔了 ${target} 一口...\n🤤 有點鹹鹹的，好上頭。`
    )
    .setImage(`attachment://${fileName}`);

  await message.channel.send({
    embeds: [embed],
    files: [attachment]
  });
}

module.exports = {
  execute
};