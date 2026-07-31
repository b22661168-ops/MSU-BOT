const { loadBindings } = require('../services/bindingService');

module.exports = {
  name: 'wallets',

  async execute(message, args) {
    if (message.author.id !== process.env.OWNER_ID) {
      return message.reply('❌ 只有管理員可以查看錢包列表。');
    }

    const bindings = loadBindings();
    const rows = [];

    for (const [discordId, data] of Object.entries(bindings)) {
      const mention = `<@${discordId}>`;

      let wallets = [];

      if (Array.isArray(data.wallets)) {
        wallets = data.wallets;
      } else if (data.wallet) {
        wallets = [data.wallet];
      }

      wallets = [...new Set(wallets)].filter(Boolean);

      if (wallets.length === 0) {
        rows.push(`${mention}\n未綁定錢包`);
      } else {
        rows.push(`${mention}\n${wallets.join('\n')}`);
      }
    }

    if (rows.length === 0) {
      return message.reply('目前沒有任何綁定資料。');
    }

    const text = `神奇的魔法誕生了 但你也把大家@出來了呢..\n\n${rows.join('\n\n')}`;

    return message.reply(text.length > 1900 ? text.slice(0, 1900) + '\n...資料太長已截斷' : text);
  }
};