const itemNames = require('../data/itemNames.json');
const layerNames = require('../data/layerNames.json');
const rewardValues = require('../data/rewardValues.json');

const {
  getParty,
  listPartyLayers
} = require('../services/partyService');

const { getArchivedRaffleHistory } = require('../services/raffleHistoryService');
const { loadBindings } = require('../services/bindingService');
const { getKnownCharacter } = require('../services/knownCharacterService');

function getItemName(itemId) {
  return itemNames[String(itemId)] || `未知物品(${itemId})`;
}

function getRewardDisplayName(itemId, rotationId, layerId) {
  let name = getItemName(itemId);

  if (itemId === 1) {
    const layerReward = rewardValues[String(layerId)] || {};

    if (rotationId === 54 && layerReward.big) name = layerReward.big;
    else if (rotationId === 37 && layerReward.normal) name = layerReward.normal;
    else if ((!rotationId || rotationId === 0) && layerReward.small) name = layerReward.small;
  }

  return name;
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
  if (!Array.isArray(data.characters)) return null;

  return data.characters.find(c =>
    c.alias?.toLowerCase() === alias.toLowerCase()
  );
}

function formatCharacterList(data) {
  if (!Array.isArray(data.characters) || data.characters.length === 0) return '無';

  return data.characters
    .map(c => `${c.alias}${c.isDefault ? ' ⭐' : ''} → ${c.characterName}`)
    .join('\n');
}

function normalizeDate(input) {
  if (!input) return null;

  const fixed = input.replace(/\//g, '-');
  const match = fixed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}T00:00:00Z`;
  }

  if (fixed.includes('T')) return fixed;
  return null;
}

function isDateLike(input) {
  if (!input) return false;
  const fixed = input.replace(/\//g, '-');
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(fixed) || fixed.includes('T');
}

function parseArgs(message, args) {
  const targetUser = message.mentions.users.first() || message.author;

  const cleanArgs = args.filter(arg =>
    !arg.startsWith('<@') && !arg.startsWith('<@!')
  );

  const dateArg = cleanArgs.find(isDateLike) || null;
  const alias = cleanArgs.find(arg => !isDateLike(arg)) || null;

  return { targetUser, alias, dateArg };
}

function isWinState(state) {
  return state === 'RAFFLE_STATE_PENDING_CLAIM' ||
         state === 'RAFFLE_STATE_CLAIMED';
}

function getFinalCount(prize, state) {
  const receivedCount = Number(prize.receivedCount?.value || 0);
  const winCount = Number(prize.winCount?.value || 0);

  if (state === 'RAFFLE_STATE_PENDING_CLAIM') return winCount;
  return receivedCount;
}

function parseMoneyValue(name) {
  const match = name.match(/^([\d.]+)(K|M)$/i);
  if (!match) return 0;

  const num = Number(match[1]);
  const unit = match[2].toUpperCase();

  if (unit === 'M') return num * 1000000;
  if (unit === 'K') return num * 1000;
  return 0;
}

function getSummaryCategory(name) {
  if (/^[\d.]+[KM]$/i.test(name)) return 'money';

  if (
    name.includes('帽') ||
    name.includes('頭盔') ||
    name.includes('披風') ||
    name.includes('肩') ||
    name.includes('腰帶') ||
    name.includes('耳環') ||
    name.includes('戒指') ||
    name.includes('項鍊') ||
    name.includes('墜飾') ||
    name.includes('手套') ||
    name.includes('鞋') ||
    name.includes('褲') ||
    name.includes('套服') ||
    name.includes('武器') ||
    name.includes('聖杯')
  ) {
    return 'equipment';
  }

  if (
    name.includes('頭髮') ||
    name.includes('時裝') ||
    name.includes('外觀')
  ) {
    return 'cosmetic';
  }

  return 'material';
}

function addToMap(map, name, count) {
  if (!map.has(name)) map.set(name, 0);
  map.set(name, map.get(name) + count);
}

function buildHistorySummary(histories) {
  const groups = {
    material: new Map(),
    equipment: new Map(),
    cosmetic: new Map()
  };

  let totalNeso = 0;

  for (const history of histories) {
    if (!isWinState(history.state)) continue;

    for (const prize of history.prizes || []) {
      const count = getFinalCount(prize, history.state);
      if (count <= 0) continue;

      const itemId = prize.rewardKey?.itemId;
      const rotationId = prize.rewardKey?.rotationId || 0;
      const name = getRewardDisplayName(itemId, rotationId, history.layerId);

      if (itemId === 1) {
        totalNeso += Math.floor(count);
        continue;
      }

      const category = getSummaryCategory(name);
      addToMap(groups[category], name, count);
    }
  }

  function formatGroup(map, type) {
    let entries = [...map.entries()];

    if (type === 'money') {
      entries.sort((a, b) => parseMoneyValue(b[0]) - parseMoneyValue(a[0]));
    } else {
      entries.sort((a, b) => b[1] - a[1]);
    }

    return entries.map(([name, count]) => `${name} ×${count}`).join('\n') || '無';
  }

  return [
    `💰 NESO`,
    totalNeso > 0 ? `${totalNeso.toLocaleString()} NESO` : '無',
    `━━━━━━━━━━`,
    `🎁 材料`,
    formatGroup(groups.material, 'material'),
    `━━━━━━━━━━`,
    `🛡️ 裝備`,
    formatGroup(groups.equipment, 'equipment'),
    `━━━━━━━━━━`,
    `🎨 外觀`,
    formatGroup(groups.cosmetic, 'cosmetic')
  ].join('\n');
}

function buildMemberWinDetail(histories) {
  const map = new Map();
  let totalNeso = 0;

  for (const history of histories) {
    if (!isWinState(history.state)) continue;

    for (const prize of history.prizes || []) {
      const count = getFinalCount(prize, history.state);
      if (count <= 0) continue;

      const itemId = prize.rewardKey?.itemId;
      const rotationId = prize.rewardKey?.rotationId || 0;
      const name = getRewardDisplayName(itemId, rotationId, history.layerId);

      if (itemId === 1) {
        totalNeso += Math.floor(count);
        continue;
      }

      addToMap(map, name, count);
    }
  }

  const lines = [];

  if (totalNeso > 0) {
    lines.push(`${totalNeso.toLocaleString()} NESO`);
  }

  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);

  for (const [name, count] of entries) {
    lines.push(`${name} ×${count}`);
  }

  return lines.length > 0 ? lines.join('、') : '無';
}

async function execute(message, args) {
  try {
    const { targetUser, alias, dateArg } = parseArgs(message, args);

    if (!dateArg) {
      return message.reply(
        [
          '格式：',
          '`>raffle history summary 日期`',
          '`>raffle history summary 別名 日期`',
          '`>raffle history summary @人 日期`',
          '`>raffle history summary @人 別名 日期`',
          '`>raffle history summary 隊伍名 日期`',
          '',
          '例如：`>raffle history summary 困史A 2026-06-18`'
        ].join('\n')
      );
    }

    const raffledAt = normalizeDate(dateArg);

    if (!raffledAt) {
      return message.reply('日期格式錯誤，請用：`2026-06-23`、`2026-6-23` 或 `2026/06/23`');
    }

    const bindings = loadBindings();

    const cleanArgs = args.filter(arg =>
      !arg.startsWith('<@') && !arg.startsWith('<@!')
    );

    const possiblePartyName = cleanArgs.find(arg => !isDateLike(arg));
    const party = possiblePartyName ? getParty(possiblePartyName) : null;

    if (party) {
      const allHistories = [];
      const partyLayers = listPartyLayers(party.storageName || party.name);

      if (partyLayers.length === 0) {
        return message.reply(
          [
            `⚠️ 隊伍 ${party.name} 尚未設定統計 Layer`,
            '',
            '請先設定：',
            `\`>pt layer ${party.name} add 困難史烏\``
          ].join('\n')
        );
      }

      const allowedLayerIds = partyLayers.map(x => String(x.layerId));
      const memberSummaries = [];
      const missingMembers = [];

      for (const member of party.members) {
        // MSUME PT2 的成員資料已保存 assetKey / wallet，也可能來自 knownchar，
        // 因此先使用隊伍內已 hydrate 的角色；舊隊伍再回退到 Discord 綁定別名。
        const memberData = member.discordId ? bindings[member.discordId] : null;
        const boundCharacter = memberData
          ? getCharacterByAlias(memberData, member.alias) ||
            memberData.characters?.find(c => c.assetKey === member.assetKey)
          : null;

        const character = {
          alias: member.alias || boundCharacter?.alias || member.characterName,
          assetKey: member.assetKey || boundCharacter?.assetKey,
          wallet: member.wallet || boundCharacter?.wallet,
          characterName: member.characterName || boundCharacter?.characterName
        };

        const memberLabel = member.discordId ? `<@${member.discordId}>` : `knownchar ${member.alias || member.characterName || '未知角色'}`;

        if (!character.assetKey || !character.wallet) {
          missingMembers.push(`${memberLabel} 缺 assetKey 或 wallet`);
          continue;
        }

        const { result, source } = await getArchivedRaffleHistory({
          assetKey: character.assetKey,
          wallet: character.wallet,
          discordId: member.discordId,
          alias: character.alias,
          characterName: character.characterName,
          raffledAt
        });

        console.log(
          `🎟️ team summary ${party.name} ${character.characterName} source: ${source.toUpperCase()}`
        );

        const histories = result?.data?.histories || [];

        const filteredHistories = histories.filter(h =>
          allowedLayerIds.includes(String(h.layerId))
        );

        allHistories.push(...filteredHistories);

        memberSummaries.push({
          discordId: member.discordId,
          alias: member.alias,
          characterName: character.characterName || '未知角色',
          histories: filteredHistories
        });
      }

      if (allHistories.length === 0) {
        return message.reply(
          `🎟️ ${party.name} 在 ${dateArg} 查無任何抽獎歷史\n\n` +
          (missingMembers.length > 0 ? `缺漏：\n${missingMembers.join('\n')}` : '')
        );
      }

      const summary = buildHistorySummary(allHistories);

      const memberLines = memberSummaries.map(m => {
        const detail = buildMemberWinDetail(m.histories);
        return `<@${m.discordId}>｜${m.characterName}（${m.alias}）\n${detail}`;
      });

      return message.reply(
        `🎟️ ${party.name} 隊伍抽獎歷史摘要\n` +
        `日期：${dateArg}\n` +
        `成員：${memberSummaries.length}/${party.members.length}\n\n` +
        `📦 隊伍總計：\n` +
        `\`\`\`\n${summary}\n\`\`\`\n` +
        `👥 成員明細：\n` +
        `\`\`\`\n${memberLines.join('\n\n')}\n\`\`\`` +
        (missingMembers.length > 0
          ? `\n\n⚠️ 缺漏：\n${missingMembers.join('\n')}`
          : '')
      );
    }
    const knownCharacter = possiblePartyName ? getKnownCharacter(possiblePartyName) : null;

    if (knownCharacter) {
      const { result, source } = await getArchivedRaffleHistory({
        assetKey: knownCharacter.assetKey,
        wallet: knownCharacter.wallet,
        discordId: `known:${knownCharacter.key}`,
        alias: knownCharacter.key,
        characterName: knownCharacter.characterName,
        raffledAt
      });

      console.log(
        `🎟️ known character history ${knownCharacter.characterName} source: ${source.toUpperCase()}`
      );

      const histories = result?.data?.histories || [];

      if (histories.length === 0) {
        return message.reply(`🎟️ ${knownCharacter.characterName} 在 ${dateArg} 查無抽獎歷史`);
      }

      const summary = buildHistorySummary(histories);

      return message.reply(
        `🎟️ ${knownCharacter.characterName} 抽獎歷史摘要\n` +
        `來源：knownCharacters\n` +
        `日期：${dateArg}\n\n` +
        `\`\`\`\n${summary}\n\`\`\``
      );
    }
    const data = bindings[targetUser.id];

    if (!data) {
      return message.reply(`${targetUser} 沒有綁定角色`);
    }

    const character = alias
      ? getCharacterByAlias(data, alias)
      : getDefaultCharacter(data);

    if (!character) {
      return message.reply(
        `❌ 找不到 ${targetUser} 的角色別名：${alias}\n\n` +
        `目前已綁定：\n\`\`\`\n${formatCharacterList(data)}\n\`\`\``
      );
    }

    if (!character?.assetKey || !character?.wallet) {
      return message.reply(`${targetUser} 的角色「${character.alias || '未知'}」綁定資料不完整，缺 assetKey 或 wallet`);
    }

    const { result, source } = await getArchivedRaffleHistory({
      assetKey: character.assetKey,
      wallet: character.wallet,
      discordId: targetUser.id,
      alias: character.alias,
      characterName: character.characterName,
      raffledAt
    });

    console.log(`🎟️ raffle history summary source: ${source.toUpperCase()}`);

    const histories = result?.data?.histories || [];

    if (histories.length === 0) {
      return message.reply(`🎟️ ${character.characterName || '未知角色'} 在 ${dateArg} 查無抽獎歷史`);
    }

    const aliasText = character.alias ? `（${character.alias}）` : '';
    const summary = buildHistorySummary(histories);

    return message.reply(
      `🎟️ ${character.characterName || '未知角色'}${aliasText} 抽獎歷史摘要\n` +
      `查詢對象：${targetUser}\n` +
      `日期：${dateArg}\n\n` +
      `\`\`\`\n${summary}\n\`\`\``
    );
  } catch (error) {
    console.error('===== RAFFLE HISTORY SUMMARY ERROR =====');
    console.error(error.response?.data || error.message);

    const apiMessage = error.response?.data?.error?.message || '';

    if (apiMessage.includes('failed to get character raffle history')) {
      return message.reply(
        `🎟️ 查無指定日期的抽獎歷史。\n可能原因：這天不是開獎日、超過可查範圍，或該角色沒有參與該次抽獎。`
      );
    }

    return message.reply(
      `❌ raffle history summary 查詢失敗：${JSON.stringify(error.response?.data || error.message)}`
    );
  }
}

module.exports = {
  execute
};