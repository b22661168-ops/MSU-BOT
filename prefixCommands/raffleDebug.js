const { getCharacterRaffleInfo } = require('../services/msuApi');
const { loadBindings } = require('../services/bindingService');

module.exports = {
  name: 'raffle-debug',

  async execute(message, args) {
    const user = message.mentions.users.first() || message.author;
    const alias = args[2] || 'main';

    const bindings = loadBindings();
    const data = bindings[user.id];

    if (!data || !Array.isArray(data.characters)) {
      return message.reply(`${user} 沒有綁定角色`);
    }

    const character =
      data.characters.find(c => c.alias === alias) ||
      data.characters.find(c => c.isDefault);

    if (!character) {
      return message.reply(`找不到角色 alias：${alias}`);
    }

    try {
        const result = await getCharacterRaffleInfo(
            character.assetKey,
            character.wallet
          );
          
          console.log('===== Raffle JSON =====');
          console.log(JSON.stringify(result, null, 2));
          
          return message.reply(
            `抽獎 JSON 已輸出到 CMD：${character.characterName}`
          );
    } catch (error) {
      console.error(error.response?.data || error.message);
      return message.reply('抽獎 API 測試失敗，請看 CMD。');
    }
  }
};