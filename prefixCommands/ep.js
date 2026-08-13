'use strict';

const {
  CATEGORY_DEFS,
  resolveCategoryKey,
  setEnhancementPool,
  deleteEnhancementPool,
  loadPoolData
} = require('../configs/enhancementPools');
const { clearEnhancementPriceCache } = require('../services/enhancementPriceService');

const labels = Object.fromEntries(CATEGORY_DEFS.map(x => [x.key, x.label]));

module.exports = {
  name: 'ep',

  async execute(message, args) {
    const sub = String(args[1] || '').toLowerCase();

    if (!sub) {
      return message.reply([
        '🔧 **EP 強化價格池維護**',
        '`>EP 1003174 140 帽子`　新增 / 覆蓋',
        '`>EP LIST`　查看目前設定',
        '`>EP DEL 帽子 140`　刪除設定',
        '',
        '部位：武器、副武器、能源、帽子、上衣、套服、褲裙、手套、鞋子、披風、肩膀、戒指、項鍊、腰帶、眼飾、臉飾、耳環'
      ].join('\n'));
    }

    if (sub === 'list') {
      const data = loadPoolData();
      const lines = ['🔨 **強化價格池**'];
      let count = 0;
      for (const def of CATEGORY_DEFS) {
        const rows = data[def.key];
        if (!rows || !Object.keys(rows).length) continue;
        lines.push('', `**${def.label}**`);
        for (const [level, row] of Object.entries(rows).sort((a, b) => Number(a[0]) - Number(b[0]))) {
          lines.push(`Lv.${level} → \`${row.itemId}\``);
          count += 1;
        }
      }
      if (!count) lines.push('', '目前尚未設定任何價格池。');
      const text = lines.join('\n');
      return message.reply(text.length <= 1900 ? text : `${text.slice(0, 1850)}\n…設定較多，已截斷。`);
    }

    if (sub === 'del' || sub === 'delete') {
      const categoryInput = args[2];
      const level = args[3];
      const categoryKey = resolveCategoryKey(categoryInput);
      if (!categoryKey || !/^\d+$/.test(String(level || ''))) {
        return message.reply('❌ 用法：`>EP DEL 帽子 140`');
      }
      const result = deleteEnhancementPool(categoryInput, level);
      if (!result?.deleted) return message.reply(`⚠️ ${labels[categoryKey]} Lv.${level} 目前沒有設定。`);
      clearEnhancementPriceCache(categoryKey, Number(level));
      return message.reply(`🗑️ 已刪除 **${labels[categoryKey]} Lv.${level}** 的強化價格池。`);
    }

    const itemId = args[1];
    const level = args[2];
    const categoryInput = args[3];
    const categoryKey = resolveCategoryKey(categoryInput);

    if (!/^\d+$/.test(String(itemId || '')) || !/^\d+$/.test(String(level || '')) || !categoryKey) {
      return message.reply([
        '❌ 用法：`>EP 1003174 140 帽子`',
        '部位可用：武器、副武器、能源、帽子、上衣、套服、褲裙、手套、鞋子、披風、肩膀、戒指、項鍊、腰帶、眼飾、臉飾、耳環'
      ].join('\n'));
    }

    const result = setEnhancementPool(categoryInput, Number(level), Number(itemId));
    clearEnhancementPriceCache(categoryKey, Number(level));
    const oldId = result?.previous?.itemId;

    return message.reply([
      oldId ? '✅ **強化價格池已更新**' : '✅ **強化價格池已新增**',
      '',
      `部位：${labels[categoryKey]}`,
      `等級：Lv.${level}`,
      oldId ? `Item ID：\`${oldId}\` → \`${itemId}\`` : `Item ID：\`${itemId}\``,
      '',
      '現在回到 `>MSUME` 就會直接看到這筆設定，不需要重啟 Bot。'
    ].join('\n'));
  }
};
