const { loadBindings } = require('../services/bindingService');

module.exports = {
  name: 'chars',

  async execute(message, args) {
    const user = message.mentions.users.first() || message.author;

    const bindings = loadBindings();
    const data = bindings[user.id];

    if (!data || !Array.isArray(data.characters) || data.characters.length === 0) {
      return message.reply(`${user} 目前沒有綁定任何角色。`);
    }

    const rows = data.characters.map((c, index) => {
      const mark = c.isDefault ? ' ⭐ 預設' : '';
      return `${index + 1}. ${c.characterName}｜別名：${c.alias}${mark}\n錢包：${c.wallet}`;
    });

    return message.reply(
      `【角色綁定列表】\n\n` +
      `Discord：${user}\n\n` +
      rows.join('\n\n')
    );
  }
};