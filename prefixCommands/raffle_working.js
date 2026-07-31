const { getCharacterRaffleInfo } = require('../services/msuApi');
const { loadBindings } = require('../services/bindingService');

const ITEM_NAMES = {
  1: 'NESO / Rotation獎勵',
  2358005: '核心寶石',

  4310403: '活動代幣 4310403',
  4310404: '活動代幣 4310404',
  4310396: '活動代幣 4310396',
  4310218: '活動代幣 4310218',
  4310199: '活動代幣 4310199',
  4310156: '活動代幣 4310156',

  1062166: '裝備褲子 1062166',
  1082636: '裝備手套 1082636',
  1102775: '裝備披風 1102775',
  1073033: '裝備鞋子 1073033',
  1072485: '裝備鞋子 1072485',
  1053499: '裝備套服 1053499',
  1054552: '裝備套服 1054552',
  1162025: '口袋/徽章類 1162025',

  1791189: '活動獎勵 1791189',
  1791564: '活動獎勵 1791564',
  1791346: '活動獎勵 1791346'
};

function getItemName(itemId) {
  return ITEM_NAMES[itemId] || `未知物品(${itemId})`;
}

function formatDate(iso) {
  if (!iso) return '未知';

  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function simplifyState(state) {
  if (state === 'RAFFLE_STATE_PARTICIPATE_SUCCESS') return '已參加';
  if (state === 'RAFFLE_STATE_PARTICIPATE_FAIL') return '參加失敗';
  return state || '未知';
}

function findRaffles(result) {
  const candidates = [
    result?.data?.raffles,
    result?.data?.raffleInformations,
    result?.raffles,
    result?.raffleInformations,
    result?.data,
    result
  ];

  for (const candidate of candidates) {
    if (
      Array.isArray(candidate) &&
      candidate.length > 0 &&
      candidate[0]?.layerId
    ) {
      return candidate;
    }
  }

  function deepSearch(obj) {
    if (!obj || typeof obj !== 'object') return [];

    if (
      Array.isArray(obj) &&
      obj.length > 0 &&
      obj[0]?.layerId &&
      obj[0]?.participationRewards
    ) {
      return obj;
    }

    for (const value of Object.values(obj)) {
      const found = deepSearch(value);
      if (found.length > 0) return found;
    }

    return [];
  }

  const found = deepSearch(result);

  console.log('findRaffles 找到數量:', found.length);
  return found;
}

function getBoundCharacter(data) {
  if (Array.isArray(data.characters)) {
    return data.characters.find(c => c.isDefault) || data.characters[0];
  }

  return {
    assetKey: data.assetKey,
    wallet: data.wallet,
    characterName: data.characterName
  };
}

function summarizeRewards(rewards = []) {
  const map = new Map();

  for (const reward of rewards) {
    const key = reward.rewardKey || {};
    const itemId = key.itemId;
    const rotationId = key.rotationId || 0;
    const tokenCount = reward.tokenCount || 0;

    const mapKey = `${itemId}-${rotationId}`;

    if (!map.has(mapKey)) {
      map.set(mapKey, {
        itemId,
        rotationId,
        tokenCount: 0
      });
    }

    map.get(mapKey).tokenCount += tokenCount;
  }

  const lines = [];

  for (const r of map.values()) {
    const name = getItemName(r.itemId);

    if (r.rotationId && r.rotationId !== 0) {
      lines.push(`- ${name} / rotation ${r.rotationId} ×${r.tokenCount}`);
    } else {
      lines.push(`- ${name} ×${r.tokenCount}`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  name: 'raffle',

  async execute(message) {
    const user = message.mentions.users.first() || message.author;

    const bindings = loadBindings();
    const data = bindings[user.id];

    if (!data) {
      return message.reply(`${user} 沒有綁定角色`);
    }

    const character = getBoundCharacter(data);

    if (!character?.assetKey || !character?.wallet) {
      return message.reply(`${user} 綁定資料不完整，缺 assetKey 或 wallet`);
    }

    const assetKey = character.assetKey;
    const wallet = character.wallet;
    const characterName = character.characterName || data.characterName || '未知角色';

    try {
      const result = await getCharacterRaffleInfo(assetKey, wallet);
      const raffles = findRaffles(result);

      if (raffles.length === 0) {
        return message.reply(`🎟️ ${characterName} 查無 raffle 資料`);
      }

      const sorted = [...raffles].sort((a, b) => {
        return new Date(a.nextRaffleAt || 0) - new Date(b.nextRaffleAt || 0);
      });

      await message.reply(`🎟️ ${characterName} 參與 raffle：${raffles.length} 筆`);

      const pageSize = 5;

      for (let i = 0; i < sorted.length; i += pageSize) {
        const pageItems = sorted.slice(i, i + pageSize);
        const pageNumber = Math.floor(i / pageSize) + 1;
        const totalPages = Math.ceil(sorted.length / pageSize);

        const blocks = [];

        for (let j = 0; j < pageItems.length; j++) {
          const r = pageItems[j];
          const realIndex = i + j + 1;
          const rewardsText = summarizeRewards(r.participationRewards);

          blocks.push([
            `${realIndex}. Layer ${r.layerId}`,
            `狀態：${simplifyState(r.state)}`,
            `下次抽獎：${formatDate(r.nextRaffleAt)}`,
            `投入：`,
            rewardsText || '- 無'
          ].join('\n'));
        }

        await message.channel.send(
          `第 ${pageNumber}/${totalPages} 頁\n\n${blocks.join('\n\n')}`
        );
      }
    } catch (error) {
      console.error('RAFFLE ERROR:', error.response?.data || error.message);
      return message.reply('抽獎 API 查詢失敗，請看 CMD。');
    }
  }
};