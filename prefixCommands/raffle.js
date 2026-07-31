const { getCharacterRaffleInfo } = require('../services/msuApi');
const { loadBindings } = require('../services/bindingService');
const { findKnownCharacterCandidates } = require('../services/knownCharacterService');
const itemNames = require('../data/itemNames.json');
const layerNames = require('../data/layerNames.json');
const rewardValues = require('../data/rewardValues.json');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

function getItemName(itemId) {
  return itemNames[String(itemId)] || `未知物品(${itemId})`;
}

function getLayerName(layerId) {
  return layerNames[String(layerId)] || `Layer ${layerId}`;
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

      if (found.length > 0) {
        return found;
      }
    }

    return [];
  }

  return deepSearch(result);
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
  if (!alias) {
    return getDefaultCharacter(data);
  }

  const target = String(alias).trim().toLowerCase();

  if (!Array.isArray(data.characters)) {
    const defaultCharacter = getDefaultCharacter(data);

    const aliasMatches =
      String(defaultCharacter.alias || 'main').toLowerCase() === target;

    const nameMatches =
      String(defaultCharacter.characterName || '').toLowerCase() === target;

    return aliasMatches || nameMatches
      ? defaultCharacter
      : null;
  }

  return data.characters.find(character =>
    String(character.alias || '').toLowerCase() === target
  ) || null;
}

function parseRaffleArgs(message) {
  const args = message.content
    .trim()
    .split(/\s+/)
    .slice(1);

  let mode = 'list';

  if (args[0]?.toLowerCase() === 'summary') {
    mode = 'summary';
    args.shift();
  }

  const argsWithoutMention = args.filter(arg =>
    !/^<@!?\d+>$/.test(arg)
  );

  const query = argsWithoutMention.join(' ').trim() || null;

  return {
    mode,
    query
  };
}

function formatKnownCharacterCandidates(candidates) {
  return candidates
    .slice(0, 10)
    .map(character => {
      const key = character.key || '無 key';
      const name = character.characterName || '未知角色';

      return `${key} → ${name}`;
    })
    .join('\n');
}

function resolveKnownCharacter(query) {
  const candidates = findKnownCharacterCandidates(query);

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      character: null,
      candidates: []
    };
  }

  const exactMatches = candidates.filter(character =>
    character.exact
  );

  if (exactMatches.length === 1) {
    return {
      character: exactMatches[0],
      candidates
    };
  }

  if (exactMatches.length > 1) {
    return {
      character: null,
      candidates: exactMatches
    };
  }

  if (candidates.length === 1) {
    return {
      character: candidates[0],
      candidates
    };
  }

  return {
    character: null,
    candidates
  };
}

function formatCharacterList(data) {
  if (
    !Array.isArray(data.characters) ||
    data.characters.length === 0
  ) {
    return '無';
  }

  return data.characters
    .map(character => {
      const mark = character.isDefault
        ? ' ⭐'
        : '';

      return (
        `${character.alias} → ` +
        `${character.characterName}${mark}`
      );
    })
    .join('\n');
}

function getRewardDisplayName(itemId, rotationId, layerId) {
  let name = getItemName(itemId);

  if (itemId === 1) {
    const layerReward =
      rewardValues[String(layerId)] || {};

    if (
      rotationId === 54 &&
      layerReward.big
    ) {
      name = layerReward.big;
    } else if (
      (rotationId === 37 || rotationId === 58) &&
      layerReward.normal
    ) {
      name = layerReward.normal;
    } else if (
      (rotationId === 0 || !rotationId) &&
      (
        layerReward.big ||
        layerReward.small ||
        layerReward.normal
      )
    ) {
      name =
        layerReward.big ||
        layerReward.small ||
        layerReward.normal;
    }
  }

  return name;
}

function summarizeRewards(rewards = [], layerId) {
  const map = new Map();

  for (const reward of rewards) {
    const key = reward.rewardKey || {};
    const itemId = key.itemId;
    const tokenCount = reward.tokenCount || 0;
    const rotationId = key.rotationId || 0;

    const name = getRewardDisplayName(
      itemId,
      rotationId,
      layerId
    );

    if (!map.has(name)) {
      map.set(name, 0);
    }

    map.set(
      name,
      map.get(name) + tokenCount
    );
  }

  const lines = [];

  for (const [name, count] of map.entries()) {
    lines.push(`${name} ×${count}`);
  }

  return lines.join('\n');
}

function buildPages(sorted, pageSize) {
  const pages = [];
  const totalPages = Math.ceil(
    sorted.length / pageSize
  );

  for (
    let index = 0;
    index < sorted.length;
    index += pageSize
  ) {
    const pageItems = sorted.slice(
      index,
      index + pageSize
    );

    const pageNumber =
      Math.floor(index / pageSize) + 1;

    const blocks = [];

    for (const raffle of pageItems) {
      const rewardsText = summarizeRewards(
        raffle.participationRewards,
        raffle.layerId
      );

      blocks.push([
        `【${getLayerName(raffle.layerId)}】`,
        '參與抽獎:',
        rewardsText || '無'
      ].join('\n'));
    }

    pages.push(
      `第 ${pageNumber}/${totalPages} 頁\n\n` +
      `\`\`\`\n` +
      `${blocks.join('\n\n')}\n` +
      `\`\`\``
    );
  }

  return pages;
}

function buildButtons(currentPage, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('raffle_prev')
      .setLabel('上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),

    new ButtonBuilder()
      .setCustomId('raffle_next')
      .setLabel('下一頁')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages - 1)
  );
}

function parseMoneyValue(name) {
  const match = name.match(
    /^([\d.]+)(K|M)$/i
  );

  if (!match) {
    return 0;
  }

  const num = Number(match[1]);
  const unit = match[2].toUpperCase();

  if (unit === 'M') {
    return num * 1000000;
  }

  if (unit === 'K') {
    return num * 1000;
  }

  return 0;
}

function getSummaryCategory(name) {
  if (/^[\d.]+[KM]$/i.test(name)) {
    return 'money';
  }

  if (
    name.includes('披風') ||
    name.includes('手套') ||
    name.includes('鞋') ||
    name.includes('褲') ||
    name.includes('套服') ||
    name.includes('聖杯') ||
    name.includes('衣服') ||
    name.includes('武器')
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

function buildSummary(raffles) {
  const groups = {
    money: new Map(),
    material: new Map(),
    equipment: new Map(),
    cosmetic: new Map()
  };

  for (const raffle of raffles) {
    for (
      const reward of
      raffle.participationRewards || []
    ) {
      const key = reward.rewardKey || {};
      const itemId = key.itemId;
      const rotationId = key.rotationId || 0;
      const tokenCount = reward.tokenCount || 0;

      const name = getRewardDisplayName(
        itemId,
        rotationId,
        raffle.layerId
      );

      const category =
        getSummaryCategory(name);

      if (!groups[category].has(name)) {
        groups[category].set(name, 0);
      }

      groups[category].set(
        name,
        groups[category].get(name) + tokenCount
      );
    }
  }

  function formatGroup(map, type) {
    let entries = [...map.entries()];

    if (type === 'money') {
      entries.sort(
        (a, b) =>
          parseMoneyValue(b[0]) -
          parseMoneyValue(a[0])
      );
    } else {
      entries.sort(
        (a, b) => b[1] - a[1]
      );
    }

    return (
      entries
        .map(
          ([name, count]) =>
            `${name} ×${count}`
        )
        .join('\n') ||
      '無'
    );
  }

  return [
    '💰 NESO',
    '',
    formatGroup(groups.money, 'money'),
    '',
    '━━━━━━━━━━',
    '',
    '🎁 代幣與其他',
    '',
    formatGroup(groups.material, 'material'),
    '',
    '━━━━━━━━━━',
    '',
    '🛡️ 裝備',
    '',
    formatGroup(groups.equipment, 'equipment'),
    '',
    '━━━━━━━━━━',
    '',
    '🎨 外觀',
    '',
    formatGroup(groups.cosmetic, 'cosmetic')
  ].join('\n');
}

module.exports = {
  name: 'raffle',

  async execute(message) {
    const mentionedUser =
      message.mentions.users.first();

    const {
      mode,
      query
    } = parseRaffleArgs(message);

    const bindings = loadBindings();

    let character = null;
    let characterName = '未知角色';
    let aliasText = '';
    let targetLabel = '';

    /*
     * 語法一：
     * >raffle @使用者
     * >raffle @使用者 別名
     * >raffle summary @使用者
     * >raffle summary @使用者 別名
     */
    if (mentionedUser) {
      const data =
        bindings[mentionedUser.id];

      if (!data) {
        return message.reply(
          `${mentionedUser} 沒有綁定角色`
        );
      }

      character = getCharacterByAlias(
        data,
        query
      );

      if (!character) {
        return message.reply(
          `❌ 找不到 ${mentionedUser} 的角色別名：${query}\n\n` +
          `目前已綁定：\n` +
          `\`\`\`\n` +
          `${formatCharacterList(data)}\n` +
          `\`\`\``
        );
      }

      characterName =
        character.characterName ||
        data.characterName ||
        '未知角色';

      aliasText = character.alias
        ? `（${character.alias}）`
        : '';

      targetLabel =
        String(mentionedUser);
    } else {
      const ownData =
        bindings[message.author.id];

      /*
       * 語法二：
       * >raffle 自己的別名
       *
       * 先查自己的角色別名，
       * 避免自己的 alias 跟 knownChar 撞名。
       */
      const ownAliasCharacter =
        query && ownData
          ? getCharacterByAlias(
              ownData,
              query
            )
          : null;

      if (ownAliasCharacter) {
        character = ownAliasCharacter;

        characterName =
          character.characterName ||
          ownData.characterName ||
          '未知角色';

        aliasText = character.alias
          ? `（${character.alias}）`
          : '';

        targetLabel =
          String(message.author);
      } else if (query) {
        /*
         * 語法三：
         * >raffle knownChar名稱
         * >raffle 角色名稱
         * >raffle summary knownChar名稱
         */
        const knownResult =
          resolveKnownCharacter(query);

        if (!knownResult.character) {
          if (
            knownResult.candidates.length > 1
          ) {
            return message.reply(
              `❌ 「${query}」符合多個 knownChar，` +
              `請輸入更完整的名稱：\n\n` +
              `\`\`\`\n` +
              `${formatKnownCharacterCandidates(
                knownResult.candidates
              )}\n` +
              `\`\`\``
            );
          }

          if (ownData) {
            return message.reply(
              `❌ 找不到角色或 knownChar：${query}\n\n` +
              `你目前已綁定：\n` +
              `\`\`\`\n` +
              `${formatCharacterList(ownData)}\n` +
              `\`\`\``
            );
          }

          return message.reply(
            `❌ 找不到角色或 knownChar：${query}\n` +
            `請確認 knownChar 的 key 或角色名稱是否正確。`
          );
        }

        character =
          knownResult.character;

        characterName =
          character.characterName ||
          character.key ||
          '未知角色';

        aliasText = character.key
          ? `（knownChar：${character.key}）`
          : '（knownChar）';

        targetLabel =
          `knownChar「${
            character.key ||
            characterName
          }」`;
      } else {
        /*
         * 語法四：
         * >raffle
         * >raffle summary
         *
         * 沒輸入目標時，
         * 查自己的預設角色。
         */
        if (!ownData) {
          return message.reply(
            `${message.author} 沒有綁定角色，` +
            `請輸入 knownChar 名稱或先綁定角色。`
          );
        }

        character =
          getDefaultCharacter(ownData);

        characterName =
          character.characterName ||
          ownData.characterName ||
          '未知角色';

        aliasText = character.alias
          ? `（${character.alias}）`
          : '';

        targetLabel =
          String(message.author);
      }
    }

    if (
      !character?.assetKey ||
      !character?.wallet
    ) {
      return message.reply(
        `❌ ${targetLabel || characterName} ` +
        `的角色資料不完整，缺少 assetKey 或 wallet。`
      );
    }

    const assetKey =
      character.assetKey;

    const wallet =
      character.wallet;

    try {
      const result =
        await getCharacterRaffleInfo(
          assetKey,
          wallet
        );

      const raffles =
        findRaffles(result);

      if (raffles.length === 0) {
        return message.reply(
          `🎟️ ${characterName}${aliasText} ` +
          `查無 raffle 資料`
        );
      }

      const sorted = [...raffles].sort(
        (a, b) => {
          return (
            new Date(
              a.nextRaffleAt || 0
            ) -
            new Date(
              b.nextRaffleAt || 0
            )
          );
        }
      );

      if (mode === 'summary') {
        const summary =
          buildSummary(sorted);

        return message.reply(
          `🎟️ ${characterName}${aliasText} ` +
          `本週抽獎摘要：${raffles.length} 筆\n\n` +
          `\`\`\`\n` +
          `${summary}\n` +
          `\`\`\``
        );
      }

      const pageSize = 5;
      const pages =
        buildPages(
          sorted,
          pageSize
        );

      let currentPage = 0;

      const reply =
        await message.reply({
          content:
            `🎟️ ${characterName}${aliasText} ` +
            `參與 raffle：${raffles.length} 筆\n\n` +
            `${pages[currentPage]}`,

          components: [
            buildButtons(
              currentPage,
              pages.length
            )
          ]
        });

      const collector =
        reply.createMessageComponentCollector({
          time: 1000 * 60 * 5
        });

      collector.on(
        'collect',
        async interaction => {
          if (
            interaction.user.id !==
            message.author.id
          ) {
            return interaction.reply({
              content:
                '這不是你的查詢結果，不能操作這個分頁。',
              ephemeral: true
            });
          }

          if (
            interaction.customId ===
            'raffle_prev'
          ) {
            currentPage = Math.max(
              0,
              currentPage - 1
            );
          }

          if (
            interaction.customId ===
            'raffle_next'
          ) {
            currentPage = Math.min(
              pages.length - 1,
              currentPage + 1
            );
          }

          await interaction.update({
            content:
              `🎟️ ${characterName}${aliasText} ` +
              `參與 raffle：${raffles.length} 筆\n\n` +
              `${pages[currentPage]}`,

            components: [
              buildButtons(
                currentPage,
                pages.length
              )
            ]
          });
        }
      );

      collector.on(
        'end',
        async () => {
          await reply.edit({
            components: []
          }).catch(() => {});
        }
      );
    } catch (error) {
      console.error(
        'RAFFLE ERROR:',
        error.response?.data ||
        error.stack ||
        error.message
      );

      return message.reply(
        '抽獎 API 查詢失敗，請看 CMD。'
      );
    }
  }
};