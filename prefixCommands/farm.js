const { scanFarm } = require('../modules/farm/scanner/farmScanner');
const { scanFarmFromText } = require('../modules/farm/scanner/farmScanner');

const {
    initFarmTables,
    addFarmTarget,
    listFarmTargets,
    getTodayRecords,
    getTodayString
  } = require('../modules/farm/repository/farmRepository');
  
  initFarmTables();
  
  function formatRows(rows) {
    if (rows.length === 0) return '今天沒有資料。';
  
    return rows.map((row, i) => {
      const typeIcon = row.type === 'seed' ? '🌱' : '🌾';
  
      return `${i + 1}. ${typeIcon}【${row.rarity}】${row.item_name}｜價格 ${row.price}｜ID ${row.farm_key}`;
    }).join('\n');
  }
  
  async function execute(message, args) {
    const sub = args[0];
  
    if (!sub) {
      return message.reply([
        '🌾 農場指令',
        '`>農場新增 pondada`',
        '`>農場列表`',
        '`>今日農場`',
        '`>農場種子`',
        '`>農場作物 小麥`'
      ].join('\n'));
    }
  
    if (sub === '新增') {
      const farmKey = args[1];
      const nickname = args[2] ?? null;
  
      if (!farmKey) return message.reply('請輸入農場 ID，例如：`>農場新增 pondada`');
  
      addFarmTarget(farmKey, nickname);
      return message.reply(`✅ 已加入農場追蹤：\`${farmKey}\``);
    }
  
    if (sub === '列表') {
      const targets = listFarmTargets();
  
      if (targets.length === 0) return message.reply('目前沒有追蹤任何農場。');
  
      return message.reply(
        targets.map((x, i) =>
          `${i + 1}. \`${x.farm_key}\`${x.nickname ? `（${x.nickname}）` : ''}`
        ).join('\n')
      );
    }
  
    if (sub === '今日') {
      const rows = getTodayRecords(getTodayString())
        .filter(row => row.type === 'product')
        .slice(0, 20);
  
      return message.reply(`🌾 今日出售作物\n${formatRows(rows)}`);
    }
  
    if (sub === '種子') {
      const rows = getTodayRecords(getTodayString())
        .filter(row => row.type === 'seed')
        .slice(0, 20);
  
      return message.reply(`🌱 今日種子\n${formatRows(rows)}`);
    }
  
    if (sub === '作物') {
      const keyword = args[1];
  
      if (!keyword) return message.reply('請輸入作物名稱，例如：`>農場作物 小麥`');
  
      const rows = getTodayRecords(getTodayString())
        .filter(row => row.item_name.includes(keyword))
        .slice(0, 20);
  
      return message.reply(`🔎 查詢：${keyword}\n${formatRows(rows)}`);
    }
  
    if (sub === '掃描文字') {
        const farmKey = args[1];
        const rawText = args.slice(2).join(' ');
      
        if (!farmKey) {
          return message.reply('請輸入農場 ID，例如：`>農場掃描文字 pondada 貼上諾諾回覆`');
        }
      
        if (!rawText) {
          return message.reply('請貼上諾諾農場回覆文字。');
        }
      
        const parsed = await scanFarmFromText(farmKey, rawText);
      
        return message.reply(
          `✅ 已寫入今日農場資料：${farmKey}\n` +
          `🌾 作物 ${parsed.products.length} 筆｜🌱 種子 ${parsed.seeds.length} 筆｜農田 ${parsed.fields.length} 筆`
        );
      }

      if (sub === '掃描') {
        const farmKey = args[1];
      
        if (!farmKey) {
          return message.reply('請輸入農場 ID，例如：`>農場掃描 pondada`');
        }
      
        try {
          const parsed = await scanFarm(message, farmKey);
      
          return message.reply(
            `✅ 掃描完成：${farmKey}\n` +
            `🌾 作物 ${parsed.products.length} 筆｜🌱 種子 ${parsed.seeds.length} 筆｜農田 ${parsed.fields.length} 筆`
          );
        } catch (error) {
          console.error(error);
          return message.reply(`❌ 掃描失敗：${error.message}`);
        }
      }

    return message.reply('未知農場指令。');
  }
  
  module.exports = {
    name: '農場',
    execute
  };