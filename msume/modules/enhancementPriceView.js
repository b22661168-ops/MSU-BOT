'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const {
  ENHANCEMENT_CATEGORIES,
  getEnhancementCategory
} = require('../../configs/enhancementPools');
const { getEnhancementPriceByPool } = require('../../services/enhancementPriceService');
const {
  formatNesoPrice,
  formatPriceChange,
  getPotentialItemName,
  formatApiTime
} = require('../../utils/enhancementPriceUtils');

function buildEnhancementCategoryPayload(ownerId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`msume_enhancement_category|${ownerId}`)
    .setPlaceholder('選擇裝備分類')
    .addOptions(ENHANCEMENT_CATEGORIES.map(category => ({
      label: category.label,
      description: category.levels.length
        ? `已設定 ${category.levels.length} 個等級價格池`
        : '價格池尚待設定',
      value: category.key,
      emoji: category.emoji
    })));

  return {
    content: [
      '## 🔨 強化價格查詢',
      '請先選擇裝備分類。',
      '',
      '同部位、同裝備等級會共用同一個強化價格池。',
      '價格由 MSU Open API 即時取得，系統會使用短時間快取以減少 API 次數。'
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`msume_home|${ownerId}`)
          .setLabel('返回玩家中心')
          .setEmoji('🏠')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function buildEnhancementLevelPayload(ownerId, categoryKey) {
  const category = getEnhancementCategory(categoryKey);
  if (!category) return buildEnhancementCategoryPayload(ownerId);

  if (!category.levels.length) {
    return {
      content: [
        `## ${category.emoji} ${category.label}｜強化價格`,
        '⚠️ 這個分類目前還沒有設定代表物品與等級價格池。',
        '',
        '使用 `>EP 物品ID 等級 部位` 新增代表物品後即可直接啟用。'
      ].join('\n'),
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`msume_enhancement_categories|${ownerId}`)
            .setLabel('返回裝備分類')
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    };
  }

  const levelMenu = new StringSelectMenuBuilder()
    .setCustomId(`msume_enhancement_level|${ownerId}|${categoryKey}`)
    .setPlaceholder('選擇裝備等級')
    .addOptions(category.levels.slice(0, 25).map(pool => ({
      label: `Lv.${pool.level}`,
      description: `${pool.itemName || '代表物品'}｜#${pool.itemId}`.slice(0, 100),
      value: String(pool.level)
    })));

  return {
    content: [
      `## ${category.emoji} ${category.label}｜強化價格`,
      '請選擇裝備等級：'
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(levelMenu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`msume_enhancement_categories|${ownerId}`)
          .setLabel('返回裝備分類')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function buildResultButtons(ownerId, categoryKey, level, active = 'summary') {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`msume_enhancement_starforce|${ownerId}|${categoryKey}|${level}`)
        .setLabel('星力價格')
        .setEmoji('⭐')
        .setStyle(active === 'starforce' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`msume_enhancement_potential|${ownerId}|${categoryKey}|${level}`)
        .setLabel('潛能價格')
        .setEmoji('🔮')
        .setStyle(active === 'potential' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`msume_enhancement_refresh|${ownerId}|${categoryKey}|${level}`)
        .setLabel('重新整理')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Success)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`msume_enhancement_levels|${ownerId}|${categoryKey}`)
        .setLabel('返回等級')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`msume_home|${ownerId}`)
        .setLabel('玩家中心')
        .setEmoji('🏠')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildStatusLines(result) {
  const latestTime = Object.values(result.starforce || {})
    .map(row => row?.currentPrice?.createDate)
    .find(Boolean) || result.fetchedAt;

  const lines = [
    `🕒 價格時間：${formatApiTime(latestTime)}`,
    result.source === 'api' ? '🌐 資料來源：即時 API' :
      result.source === 'cache' ? '⚡ 資料來源：快取' :
      '⚠️ API 更新失敗，顯示最後一次成功資料'
  ];

  return lines;
}

async function buildEnhancementSummaryPayload(ownerId, categoryKey, level, options = {}) {
  const category = getEnhancementCategory(categoryKey);
  const result = await getEnhancementPriceByPool(categoryKey, level, options);
  const starCount = Object.keys(result.starforce || {}).length;
  const potentialCount = Object.keys(result.potential || {}).length;

  return {
    content: [
      `## 🔨 ${category?.label || categoryKey} Lv.${level}｜強化價格`,
      `🧪 代表物品：${result.pool.itemName || '未知'} (#${result.pool.itemId})`,
      '',
      `⭐ 星力價格：${starCount} 個階段`,
      `🔮 潛能價格：${potentialCount} 種方塊`,
      '',
      ...buildStatusLines(result),
      '',
      '請選擇要查看的價格：'
    ].join('\n'),
    components: buildResultButtons(ownerId, categoryKey, level, 'summary')
  };
}

async function buildStarforcePricePayload(ownerId, categoryKey, level) {
  const category = getEnhancementCategory(categoryKey);
  const result = await getEnhancementPriceByPool(categoryKey, level);
  const entries = Object.entries(result.starforce || {})
    .filter(([, row]) => row?.currentPrice?.step !== 'STEP_TYPE_DISCOVERY')
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  const lines = entries.map(([star, row]) => {
    const current = row?.currentPrice?.price;
    const previous = row?.previousPrice?.price;
    const step = row?.currentPrice?.step;
    const target = Number(star) + 1;
    const label = step === 'STEP_TYPE_DISCOVERY'
      ? `${String(star).padStart(2, ' ')}★ 探索`
      : `${String(star).padStart(2, ' ')}→${String(target).padStart(2, ' ')}★`;
    return `${label}  ${formatNesoPrice(current)}  ${formatPriceChange(current, previous)}`;
  });

  return {
    content: [
      `## ⭐ ${category?.label || categoryKey} Lv.${level}｜星力價格`,
      `代表物品：${result.pool.itemName || '未知'} (#${result.pool.itemId})`,
      '',
      '```text',
      ...lines,
      '```',
      ...buildStatusLines(result)
    ].join('\n'),
    components: buildResultButtons(ownerId, categoryKey, level, 'starforce')
  };
}

async function buildPotentialPricePayload(ownerId, categoryKey, level) {
  const category = getEnhancementCategory(categoryKey);
  const result = await getEnhancementPriceByPool(categoryKey, level);
  const entries = Object.entries(result.potential || {});

  const lines = entries.map(([itemId, row]) => {
    const current = row?.currentPrice?.price;
    const previous = row?.previousPrice?.price;
    const name = getPotentialItemName(itemId);
    return `${name}\n${formatNesoPrice(current)}  ${formatPriceChange(current, previous)}`;
  });

  return {
    content: [
      `## 🔮 ${category?.label || categoryKey} Lv.${level}｜潛能價格`,
      `代表物品：${result.pool.itemName || '未知'} (#${result.pool.itemId})`,
      '',
      ...lines,
      '',
      ...buildStatusLines(result)
    ].join('\n'),
    components: buildResultButtons(ownerId, categoryKey, level, 'potential')
  };
}

function enhancementPriceErrorPayload(ownerId, error) {
  const status = error?.response?.status;
  const apiMessage = error?.response?.data?.error?.message || error?.message;

  return {
    content: [
      '## ❌ 強化價格查詢失敗',
      status ? `HTTP：${status}` : null,
      apiMessage ? `原因：${apiMessage}` : '目前無法取得強化價格。',
      '',
      'MSU Open API 可能暫時維護、達到使用限制，或此價格池尚未設定。',
      '請稍後再試。'
    ].filter(Boolean).join('\n'),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`msume_enhancement_categories|${ownerId}`)
          .setLabel('返回裝備分類')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`msume_home|${ownerId}`)
          .setLabel('玩家中心')
          .setEmoji('🏠')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

module.exports = {
  buildEnhancementCategoryPayload,
  buildEnhancementLevelPayload,
  buildEnhancementSummaryPayload,
  buildStarforcePricePayload,
  buildPotentialPricePayload,
  enhancementPriceErrorPayload
};
