const { loadBindings } = require('../services/bindingService');

function maskWallet(wallet) {
  if (!wallet) return '未知';
  return `${wallet.slice(0, 8)}...${wallet.slice(-6)}`;
}

function formatCharacterList(data) {
  if (!Array.isArray(data.characters) || data.characters.length === 0) {
    return '尚未綁定角色';
  }

  return data.characters.map(c => {
    const mark = c.isDefault ? ' ⭐ 預設' : '';
    return [
      `別名：${c.alias}${mark}`,
      `角色：${c.characterName || '未知'}`,
      `錢包：${maskWallet(c.wallet)}`,
      `AssetKey：${c.assetKey || '未知'}`
    ].join('\n');
  }).join('\n\n');
}

module.exports = {
  name: 'characters',

  async execute(message, args) {
    const bindings = loadBindings();

    const subCommand = args[1];

    if (subCommand === 'all') {
      if (message.author.id !== process.env.OWNER_ID) {
        return message.reply('❌ 你沒有權限查看全部綁定資料');
      }

      const blocks = Object.entries(bindings).map(([discordId, data]) => {
        return [
          `Discord：${data.discordName || discordId}`,
          `ID：${discordId}`,
          formatCharacterList(data)
        ].join('\n');
      });

      if (blocks.length === 0) {
        return message.reply('目前沒有任何綁定資料');
      }

      return message.reply(
        `📒 全部綁定資料：${blocks.length} 人\n\n` +
        `\`\`\`\n${blocks.join('\n\n────────────\n\n')}\n\`\`\``
      );
    }

    const data = bindings[message.author.id];

    if (!data) {
      return message.reply('你目前沒有綁定任何角色');
    }

    return message.reply(
      `📒 你的綁定角色：\n\n` +
      `\`\`\`\n${formatCharacterList(data)}\n\`\`\``
    );
  }
};