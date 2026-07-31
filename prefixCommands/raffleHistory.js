const itemNames = require('../data/itemNames.json');
const layerNames = require('../data/layerNames.json');
const rewardValues = require('../data/rewardValues.json');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const {
    getArchivedRaffleHistory
  } = require('../services/raffleHistoryService');

const { loadBindings } = require('../services/bindingService');
const { getKnownCharacter } = require('../services/knownCharacterService');

function getItemName(itemId) {
  return itemNames[String(itemId)] || `未知物品(${itemId})`;
}

function getLayerName(layerId) {
  return layerNames[String(layerId)] || `Layer ${layerId}`;
}

function getRewardDisplayName(itemId, rotationId, layerId) {
  let name = getItemName(itemId);

  if (itemId === 1) {
    const layerReward = rewardValues[String(layerId)] || {};

    if (rotationId === 54 && layerReward.big) {
      name = layerReward.big;
    } else if (rotationId === 37 && layerReward.normal) {
      name = layerReward.normal;
    } else if ((!rotationId || rotationId === 0) && layerReward.small) {
      name = layerReward.small;
    }
  }

  return name;
}

function addToMap(map, name, count) {
  if (!map.has(name)) map.set(name, 0);
  map.set(name, map.get(name) + count);
}

function summarizePrizePool(prizes = [], layerId) {
  const map = new Map();

  for (const prize of prizes || []) {
    const itemId = prize.rewardKey?.itemId;
    const rotationId = prize.rewardKey?.rotationId || 0;
    const count = prize.tokenCount || 0;
    const name = getRewardDisplayName(itemId, rotationId, layerId);
    addToMap(map, name, count);
  }

  return [...map.entries()].map(([name, count]) => `${name} ×${count}`);
}

function summarizeReceivedRewards(prizes = [], layerId, state) {
    const map = new Map();
  
    for (const prize of prizes || []) {
      const receivedCount = Number(prize.receivedCount?.value || 0);
      const winCount = Number(prize.winCount?.value || 0);
  
      const finalCount =
        state === 'RAFFLE_STATE_PENDING_CLAIM'
          ? winCount
          : receivedCount;
  
      if (finalCount <= 0) continue;
  
      const itemId = prize.rewardKey?.itemId;
      const rotationId = prize.rewardKey?.rotationId || 0;
  
      if (itemId === 1) {
        addToMap(map, 'NESO', Math.floor(finalCount));
      } else {
        const name = getRewardDisplayName(itemId, rotationId, layerId);
        addToMap(map, name, finalCount);
      }
    }
  
    return [...map.entries()].map(([name, count]) => {
      if (name === 'NESO') return `${count.toLocaleString()} NESO`;
      return `${name} ×${count}`;
    });
  }

function getDefaultCharacter(data) {
  if (Array.isArray(data.characters)) {
    return data.characters.find(c => c.isDefault) || data.characters[0];
  }

  return {
    alias: 'main',
    assetKey: data.assetKey,
    wallet: data.wallet,
    characterName: data.characterName
  };
}

function getCharacterByAlias(data, alias) {
  if (!alias) return getDefaultCharacter(data);

  if (!Array.isArray(data.characters)) {
    return null;
  }

  return data.characters.find(c =>
    c.alias?.toLowerCase() === alias.toLowerCase()
  );
}

function formatCharacterList(data) {
  if (!Array.isArray(data.characters) || data.characters.length === 0) {
    return '無';
  }

  return data.characters
    .map(c => `${c.alias}${c.isDefault ? ' ⭐' : ''} → ${c.characterName}`)
    .join('\n');
}

function normalizeDate(input) {
  if (!input) return null;

  const fixed = input.replace(/\//g, '-');
  const match = fixed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (match) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    return `${year}-${month}-${day}T00:00:00Z`;
  }

  if (fixed.includes('T')) return fixed;

  return null;
}

function isDateLike(input) {
  if (!input) return false;
  const fixed = input.replace(/\//g, '-');
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(fixed) || fixed.includes('T');
}

function parseHistoryArgs(message, args) {
  const targetUser = message.mentions.users.first() || message.author;

  const cleanArgs = args.filter(arg =>
    !arg.startsWith('<@') && !arg.startsWith('<@!')
  );

  let alias = null;
  let dateArg = null;
  let rawKeyword = null;

  const rawIndex = cleanArgs.findIndex(arg => arg.toLowerCase() === 'raw');

  if (rawIndex !== -1) {
    dateArg = cleanArgs.find(isDateLike) || null;
    rawKeyword = cleanArgs.slice(rawIndex + 1).join(' ') || null;

    const possibleAlias = cleanArgs.find(arg =>
      !isDateLike(arg) && arg.toLowerCase() !== 'raw'
    );

    alias = possibleAlias || null;

    return { targetUser, alias, dateArg, rawKeyword };
  }

  dateArg = cleanArgs.find(isDateLike) || null;

  const possibleAlias = cleanArgs.find(arg => !isDateLike(arg));
  alias = possibleAlias || null;

  return { targetUser, alias, dateArg, rawKeyword };
}

function getStateText(state) {
  if (state === 'RAFFLE_STATE_PENDING_CLAIM') return '🎉 中獎待領';
  if (state === 'RAFFLE_STATE_CLAIMED') return '✅ 已領獎';
  if (state === 'RAFFLE_STATE_PARTICIPATE_FAIL') return '❌ 未中';
  if (state === 'RAFFLE_STATE_LOSE') return '❌ 未中';
  return state || '未知狀態';
}

function isWinState(state) {
  return state === 'RAFFLE_STATE_PENDING_CLAIM' || state === 'RAFFLE_STATE_CLAIMED';
}

function isLoseState(state) {
  return state === 'RAFFLE_STATE_PARTICIPATE_FAIL' || state === 'RAFFLE_STATE_LOSE';
}

function buildPages(histories, pageSize) {
  const pages = [];
  const totalPages = Math.ceil(histories.length / pageSize);

  for (let i = 0; i < histories.length; i += pageSize) {
    const pageItems = histories.slice(i, i + pageSize);
    const pageNumber = Math.floor(i / pageSize) + 1;

    const lines = pageItems.map((h, localIndex) => {
      const index = i + localIndex + 1;
      const poolLines = summarizePrizePool(h.prizes, h.layerId);
      const receivedLines = summarizeReceivedRewards(h.prizes, h.layerId, h.state);

      return [
        `${index}. ${getLayerName(h.layerId)}`,
        `狀態：${getStateText(h.state)}`,
        `抽獎資格：${poolLines.length > 0 ? poolLines.join('、') : '無'}`,
        `中獎明細：${receivedLines.length > 0 ? receivedLines.join('、') : '無'}`
      ].join('\n');
    });

    pages.push(
      [
        `第 ${pageNumber}/${totalPages} 頁`,
        '',
        '```',
        lines.join('\n\n'),
        '```'
      ].join('\n')
    );
  }

  return pages;
}

function buildButtons(currentPage, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('raffle_history_prev')
      .setLabel('上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),

    new ButtonBuilder()
      .setCustomId('raffle_history_next')
      .setLabel('下一頁')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages - 1)
  );
}

async function execute(message, args) {
  try {
    const {
      targetUser,
      alias,
      dateArg,
      rawKeyword
    } = parseHistoryArgs(message, args);

    if (!dateArg) {
      return message.reply(
        [
          '格式：',
          '`>raffle history 日期`',
          '`>raffle history 別名 日期`',
          '`>raffle history @人 日期`',
          '`>raffle history @人 別名 日期`',
          '',
          '例如：`>raffle history @夜夜 本尊 2026-06-18`'
        ].join('\n')
      );
    }

    const raffledAt = normalizeDate(dateArg);

    if (!raffledAt) {
      return message.reply(
        '日期格式錯誤，請用：`2026-06-23`、`2026-6-23` 或 `2026/06/23`'
      );
    }

    const bindings = loadBindings();

    const knownCharacter = alias ? getKnownCharacter(alias) : null;
    
    let character = null;
    let queryLabel = null;
    let queryTargetText = null;
    let queryDiscordId = targetUser.id;
    
    if (knownCharacter) {
      character = {
        alias: knownCharacter.key,
        assetKey: knownCharacter.assetKey,
        wallet: knownCharacter.wallet,
        characterName: knownCharacter.characterName
      };
    
      queryLabel = 'knownCharacters';
      queryTargetText = `knownCharacters：${knownCharacter.key}`;
      queryDiscordId = `known:${knownCharacter.key}`;
    } else {
      const data = bindings[targetUser.id];
    
      if (!data) {
        return message.reply(`${targetUser} 沒有綁定角色`);
      }
    
      character = alias
        ? getCharacterByAlias(data, alias)
        : getDefaultCharacter(data);
    
      if (!character) {
        return message.reply(
          `❌ 找不到 ${targetUser} 的角色別名：${alias}\n\n` +
          `目前已綁定：\n\`\`\`\n${formatCharacterList(data)}\n\`\`\``
        );
      }
    
      queryLabel = 'binding';
      queryTargetText = `${targetUser}`;
    }
    
    if (!character?.assetKey || !character?.wallet) {
      return message.reply(`${targetUser} 的角色「${character.alias || '未知'}」綁定資料不完整，缺 assetKey 或 wallet`);
    }

    const { result, source } =
    await getArchivedRaffleHistory({
      assetKey: character.assetKey,
      wallet: character.wallet,
      discordId: targetUser.id,
      alias: character.alias,
      characterName: character.characterName,
      raffledAt
    });
  
  console.log(
    `🎟️ raffle history source: ${source.toUpperCase()}`
  );

    const histories = result?.data?.histories || [];

    if (rawKeyword) {
      const target = histories.find(h =>
        String(h.layerId) === rawKeyword ||
        getLayerName(h.layerId).includes(rawKeyword)
      );

      if (!target) return message.reply(`找不到 Layer：${rawKeyword}`);

      console.log('===== RAFFLE HISTORY RAW LAYER =====');
      console.log(JSON.stringify(target, null, 2));

      return message.reply(
        `✅ 已輸出 ${getLayerName(target.layerId)} 的完整 raw JSON，請看終端機。`
      );
    }

    if (histories.length === 0) {
      return message.reply(
        `🎟️ ${character.characterName || '未知角色'} 在 ${dateArg} 查無抽獎歷史`
      );
    }

    const wins = histories.filter(h => isWinState(h.state));
    const fails = histories.filter(h => isLoseState(h.state));

    const aliasText = character.alias ? `（${character.alias}）` : '';

    const header = [
      `🎟️ ${character.characterName || '未知角色'}${aliasText} 抽獎歷史`,
      `查詢對象：${queryTargetText}`,
      `日期：${dateArg}`,
      '',
      `✅ 中獎：${wins.length}`,
      `❌ 未中：${fails.length}`,
      `📦 總獎池：${histories.length}`,
      ''
    ].join('\n');

    const pageSize = 5;
    const pages = buildPages(histories, pageSize);
    let currentPage = 0;

    const reply = await message.reply({
      content: `${header}${pages[currentPage]}`,
      components: [buildButtons(currentPage, pages.length)]
    });

    const collector = reply.createMessageComponentCollector({
      time: 1000 * 60 * 5
    });

    collector.on('collect', async interaction => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: '這不是你的查詢結果，不能操作這個分頁。',
          ephemeral: true
        });
      }

      if (interaction.customId === 'raffle_history_prev') {
        currentPage = Math.max(0, currentPage - 1);
      }

      if (interaction.customId === 'raffle_history_next') {
        currentPage = Math.min(pages.length - 1, currentPage + 1);
      }

      await interaction.update({
        content: `${header}${pages[currentPage]}`,
        components: [buildButtons(currentPage, pages.length)]
      });
    });

    collector.on('end', async () => {
      await reply.edit({
        components: []
      }).catch(() => {});
    });
  } catch (error) {
    console.error('===== RAFFLE HISTORY ERROR =====');
    console.error(error.response?.data || error.message);

    const apiMessage = error.response?.data?.error?.message || '';

    if (apiMessage.includes('failed to get character raffle history')) {
      return message.reply(
        `🎟️ 查無指定日期的抽獎歷史。\n可能原因：這天不是開獎日、超過可查範圍，或該角色沒有參與該次抽獎。`
      );
    }

    return message.reply(
      `❌ raffle history 查詢失敗：${JSON.stringify(error.response?.data || error.message)}`
    );
  }
}

module.exports = {
  execute,
};