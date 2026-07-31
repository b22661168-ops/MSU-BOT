const {
    loadKnownCharacters,
    addKnownCharacter,
    removeKnownCharacter
  } = require('../services/knownCharacterService');
  
  const {
    searchCharacterByName,
    findCharacterByWalletAndName
  } = require('../services/characterLookupService');
  
  function isOwner(message) {
    return message.author.id === process.env.OWNER_ID;
  }
  
  function getSearchItems(raw) {
    return (
      raw?.data?.items ||
      raw?.data?.characters ||
      raw?.data?.results ||
      raw?.items ||
      raw?.characters ||
      raw?.results ||
      []
    );
  }
  
  function findExactSearchResult(raw, name) {
    const items = getSearchItems(raw);
    const lowerName = String(name).toLowerCase();
  
    return items.find(item =>
      String(item.name || item.characterName || '').toLowerCase() === lowerName
    ) || null;
  }
  
  function getWalletFromSearchResult(item) {
    return (
      item?.owner?.walletAddr ||
      item?.owner?.walletAddress ||
      item?.tokenInfo?.ownerWalletAddr ||
      item?.walletAddr ||
      item?.walletAddress ||
      item?.ownerWalletAddr ||
      null
    );
  }
  
  async function resolveWalletByCharacterName(name) {
    const raw = await searchCharacterByName(name);
    const target = findExactSearchResult(raw, name);
  
    if (!target) {
      return {
        wallet: null,
        reason: '找不到完全相同名稱的角色'
      };
    }
  
    const wallet = getWalletFromSearchResult(target);
  
    if (!wallet) {
      return {
        wallet: null,
        reason: '有找到角色，但找不到 wallet 欄位'
      };
    }
  
    return {
      wallet,
      rawTarget: target
    };
  }
  
  async function execute(message, args) {
    if (!isOwner(message)) {
      return message.reply('❌ 這個指令只有管理員可以使用');
    }
  
    const sub = args[1]?.toLowerCase();
  
    if (!sub) {
      return message.reply(
        [
          '格式：',
          '`>knownchar add 角色名 [錢包地址]`',
          '`>knownchar search 角色名`',
          '`>knownchar remove 角色名`',
          '`>knownchar list`'
        ].join('\n')
      );
    }
  
    if (sub === 'search') {
      const name = args[2];
  
      if (!name) {
        return message.reply('格式：`>knownchar search 角色名`');
      }
  
      try {
        const raw = await searchCharacterByName(name);
        const items = getSearchItems(raw);
        const exact = findExactSearchResult(raw, name);
  
        console.log('===== KNOWNCHAR SEARCH RAW =====');
        console.log(JSON.stringify(raw, null, 2));
  
        if (!exact) {
          const preview = items
            .slice(0, 5)
            .map(x => `${x.name || x.characterName || '未知'}｜${getWalletFromSearchResult(x) || '無 wallet'}`)
            .join('\n') || '無';
  
          return message.reply(
            [
              `⚠️ 已搜尋 ${name}，但沒有找到完全同名角色。`,
              `結果數：${items.length}`,
              '',
              '前幾筆：',
              '```',
              preview,
              '```',
              '完整 raw JSON 已輸出到終端機。'
            ].join('\n')
          );
        }
  
        return message.reply(
          [
            `✅ 找到完全同名角色`,
            `角色：${exact.name || exact.characterName}`,
            `wallet：${getWalletFromSearchResult(exact) || '無 wallet'}`,
            `結果數：${items.length}`,
            '',
            `完整 raw JSON 已輸出到終端機。`
          ].join('\n')
        );
      } catch (error) {
        console.error('===== KNOWNCHAR SEARCH ERROR =====');
        console.error(error.response?.data || error.message);
  
        return message.reply(
          `❌ 搜尋角色失敗：${JSON.stringify(error.response?.data || error.message)}`
        );
      }
    }
  
    if (sub === 'add') {
      const name = args[2];
      let wallet = args[3];
  
      if (!name) {
        return message.reply('格式：`>knownchar add 角色名 [錢包地址]`');
      }
  
      try {
        let walletSource = '手動輸入';
  
        if (!wallet) {
          const resolved = await resolveWalletByCharacterName(name);
  
          if (!resolved.wallet) {
            return message.reply(
              `❌ 無法自動取得 ${name} 的 wallet：${resolved.reason}\n` +
              `你可以改用：\`>knownchar add ${name} 0x錢包地址\``
            );
          }
  
          wallet = resolved.wallet;
          walletSource = '角色搜尋';
        }
  
        const character = await findCharacterByWalletAndName(wallet, name);
  
        if (!character || !character.assetKey) {
          return message.reply(
            `❌ 找不到角色：${name}\n` +
            `wallet：${wallet}\n` +
            `請確認這個錢包底下有這隻角色。`
          );
        }
  
        const saved = addKnownCharacter(name, character);
  
        return message.reply(
          [
            `✅ 已記錄角色`,
            `角色：${saved.characterName}`,
            `Key：${saved.key}`,
            `assetKey：${saved.assetKey}`,
            `wallet：${saved.wallet}`,
            `wallet來源：${walletSource}`
          ].join('\n')
        );
      } catch (error) {
        console.error('===== KNOWNCHAR ADD ERROR =====');
        console.error(error.response?.data || error.message);
  
        return message.reply(
          `❌ 新增角色失敗：${JSON.stringify(error.response?.data || error.message)}`
        );
      }
    }
  
    if (sub === 'remove') {
      const name = args[2];
  
      if (!name) {
        return message.reply('格式：`>knownchar remove 角色名`');
      }
  
      const ok = removeKnownCharacter(name);
  
      return message.reply(ok ? `✅ 已移除 ${name}` : `❌ 找不到 ${name}`);
    }
  
    if (sub === 'list') {
      const data = loadKnownCharacters();
      const entries = Object.values(data);
  
      if (entries.length === 0) {
        return message.reply('目前沒有已記錄角色');
      }
  
      return message.reply(
        entries
          .map(c => `${c.key} → ${c.characterName}`)
          .join('\n')
      );
    }
  
    return message.reply('未知子指令：`add / search / remove / list`');
  }
  
  module.exports = {
    execute
  };