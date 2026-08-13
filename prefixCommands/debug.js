'use strict';

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const {
  getEnhancementDynamicPrice
} = require('../services/msuApi');

module.exports = {
  name: 'debug',

  async execute(message, args) {
    const itemId = args[1];

    if (!itemId || !/^\d+$/.test(itemId)) {
      return message.reply(
        '❌ 用法：`>DEBUG 1003174`'
      );
    }

    await message.reply(
      `🔍 正在查詢強化價格...\n物品 ID：\`${itemId}\``
    );

    try {
      const data = await getEnhancementDynamicPrice(itemId);

      console.log('\n======================================');
      console.log('MSU ENHANCEMENT DYNAMIC PRICE');
      console.log('Item ID:', itemId);
      console.log('======================================');
      console.log(JSON.stringify(data, null, 2));
      console.log('======================================\n');

      const debugDir = path.join(
        __dirname,
        '..',
        'data',
        'debug'
      );

      fs.mkdirSync(debugDir, {
        recursive: true
      });

      const fileName =
        `enhancement-${itemId}-${Date.now()}.json`;

      const outputPath =
        path.join(debugDir, fileName);

      fs.writeFileSync(
        outputPath,
        JSON.stringify(data, null, 2),
        'utf8'
      );

      return message.reply(
        `✅ 強化價格查詢成功\n` +
        `物品 ID：\`${itemId}\`\n` +
        `JSON：\`${fileName}\``
      );

    } catch (error) {

      console.error('\n========== ENHANCEMENT ERROR ==========');

      console.error(
        'HTTP:',
        error.response?.status
      );

      console.error(
        JSON.stringify(
          error.response?.data || error.message,
          null,
          2
        )
      );

      console.error('=======================================\n');

      return message.reply(
        `❌ 強化價格查詢失敗\n` +
        `HTTP：\`${error.response?.status || 'Unknown'}\`\n` +
        `錯誤：\`${error.response?.data?.error?.message || error.message}\``
      );
    }
  }
};