const { getCharactersByWallet } = require('../services/msuApi');
const { loadBindings, saveBindings, normalizeBinding } = require('../services/bindingService');

module.exports = {
  name: 'bind',

  async execute(message, args) {
    if (message.author.id !== process.env.OWNER_ID) {
      return message.reply('❌你覺得你可以這樣亂綁人家嗎._.');
    }

    const user = message.mentions.users.first();
    const wallet = args[2];
    const name = args[3];
    const alias = args[4] || 'main';

    if (!user) {
      return message.reply(
        '❌ 找不到 Discord 使用者\n\n' +
        '正確格式：\n' +
        '>bind @人 錢包地址 角色名稱 別名\n\n' +
        '範例：\n' +
        '>bind @夜夜 0xf068... CloudDarling main'
      );
    }

    if (!wallet) {
      return message.reply(
        '❌ 缺少錢包地址\n\n' +
        '正確格式：\n' +
        '>bind @人 錢包地址 角色名稱 別名'
      );
    }

    if (wallet.startsWith('<@')) {
      return message.reply(
        '🤣 你把 @人 跟錢包地址的位置打反了蠢蛋\n\n' +
        '正確格式：\n' +
        '>bind @人 錢包地址 角色名稱 別名'
      );
    }

    if (!wallet.startsWith('0x')) {
      return message.reply(
        '❌ 錢包地址格式錯誤\n\n' +
        '錢包地址應該以 0x 開頭'
      );
    }

    if (!name) {
      return message.reply(
        '❌ 缺少角色名稱\n\n' +
        '正確格式：\n' +
        '>bind @人 錢包地址 角色名稱 別名'
      );
    }

    try {
      const characters = await getCharactersByWallet(wallet);

      const target = characters.find(c =>
        c.name && c.name.toLowerCase() === name.toLowerCase()
      );

      if (!target) {
        return message.reply(
          `❌ 找不到角色：${name}\n` +
          `請確認錢包地址與角色名稱是否正確。`
        );
      }

      const bindings = loadBindings();

      if (!bindings[user.id]) {
        bindings[user.id] = {
          discordName: user.username,
          wallets: [],
          characters: [],
          updatedAt: new Date().toISOString()
        };
      }

      const binding = normalizeBinding(bindings[user.id]);

      binding.discordName = user.username;

      if (!Array.isArray(binding.wallets)) {
        binding.wallets = [];
      }

      if (!Array.isArray(binding.characters)) {
        binding.characters = [];

        // 舊格式轉新格式
        if (binding.characterName && binding.assetKey) {
          binding.characters.push({
            alias: 'main',
            characterName: binding.characterName,
            assetKey: binding.assetKey,
            wallet: binding.wallet,
            isDefault: true,
            updatedAt: binding.updatedAt || new Date().toISOString()
          });
        }
      }

      if (!binding.wallets.includes(wallet)) {
        binding.wallets.push(wallet);
      }

      const normalizedAlias = alias.toLowerCase();
      const existingIndex = binding.characters.findIndex(c => c.assetKey === target.assetKey);
      const shouldBeDefault = normalizedAlias === 'main' || normalizedAlias === '本尊';

      const newCharacter = {
        ...(existingIndex >= 0 ? binding.characters[existingIndex] : {}),
        alias,
        characterName: target.name,
        assetKey: target.assetKey,
        wallet,
        isEnabled: true,
        isDefault: shouldBeDefault || (binding.characters.length === 0),
        updatedAt: new Date().toISOString()
      };

      if (existingIndex >= 0) binding.characters[existingIndex] = newCharacter;
      else binding.characters.push(newCharacter);

      if (newCharacter.isDefault) {
        binding.characters = binding.characters.map(c => ({
          ...c,
          isDefault: c.assetKey === target.assetKey
        }));
      }

      binding.updatedAt = new Date().toISOString();

      saveBindings(bindings);

      return message.reply(
        `✅ 一道神奇的光芒照亮在你的身上，你的DC跟MSU綁在一起了\n\n` +
        `Discord：${user}\n` +
        `角色：${target.name}\n` +
        `別名：${alias}\n` +
        `錢包：${wallet.slice(0, 8)}...${wallet.slice(-6)}\n` +
        `AssetKey：${target.assetKey}`
      );
    } catch (error) {
      console.error(error.response?.data || error.message);
      return message.reply('綁定失敗，請看終端機錯誤訊息。');
    }
  }
};