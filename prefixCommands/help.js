async function execute(message, args) {
    const topic = args[1]?.toLowerCase();
  
    if (!topic) {
      return message.reply(
        [
          '📖 MSU Bot 指令幫助',
          '',
          '```',
          '>msuhelp raffle   抽獎查詢相關',
          '>msuhelp pt       隊伍 / Layer 設定',
          '>msuhelp bind     角色綁定相關',
          '>msuhelp card     名片相關',
          '>msuhelp data     資料查詢相關',
          '`>split add 隊伍名 日期 物品名稱` 加入分寶物品',
          '`>split session 隊伍名 日期` 查看目前分寶單',
          '```',
          '',
          '常用指令：',
          '```',
          '>raffle summary',
          '>raffle history summary 日期',
          '>raffle history summary 隊伍名 日期',
          '>pt 隊伍名',
          '>pt layer 隊伍名',
          '```'
        ].join('\n')
      );
    }
  
    if (topic === 'raffle') {
      return message.reply(
        [
          '🎟️ 抽獎相關指令',
          '',
          '```',
          '>raffle',
          '查看目前抽獎結果',
          '',
          '>raffle summary',
          '查看本週抽獎摘要',
          '',
          '>raffle history 日期',
          '查看指定日期抽獎歷史',
          '',
          '>raffle history 別名 日期',
          '查看指定角色別名的歷史',
          '',
          '>raffle history @人 日期',
          '查看別人的抽獎歷史',
          '',
          '>raffle history summary 日期',
          '查看指定日期抽獎歷史摘要',
          '',
          '>raffle history summary 隊伍名 日期',
          '查看隊伍指定 Layer 的抽獎歷史摘要',
          '```',
          '`>split price 隊伍名 日期 物品名稱 成交價` 輸入成交價',
          '',
          '範例：',
          '```',
          '>raffle history summary 2026-06-18',
          '>raffle history summary 困史A 2026-06-18',
          '```'
        ].join('\n')
      );
    }
  
    if (topic === 'data') {
      return message.reply(
        [
          '📦 資料查詢相關',
          '',
          '```',
          '>msuitem 物品名稱或ID',
          '查詢物品資料',
          '',
          '>layer layerId或名稱',
          '查詢 Layer / 王 / 抽獎池資料',
          '',
          '>reward layerId',
          '查詢指定 Layer 的獎勵資料',
          '',
          '>datahelp',
          '查看資料查詢說明',
          '```'
        ].join('\n')
      );
    }
  
    if (topic === 'pt' || topic === 'party') {
      return message.reply(
        [
          '👥 PT 隊伍相關指令',
          '',
          '```',
          '>pt 隊伍名 @人 角色別名 @人 角色別名',
          '建立或覆蓋隊伍，人數不限',
          '',
          '>pt 隊伍名',
          '查看隊伍',
          '',
          '>pt list',
          '查看全部隊伍',
          '',
          '>pt delete 隊伍名',
          '刪除隊伍',
          '',
          '>pt weight 隊伍名 @人 角色別名 權重',
          '修改隊員分配權重',
          '',
          '>pt layer 隊伍名',
          '查看隊伍統計 Layer',
          '',
          '>pt layer 隊伍名 add layerId或名稱',
          '新增隊伍統計 Layer',
          '',
          '>pt layer 隊伍名 remove layerId或名稱',
          '移除隊伍統計 Layer',
          '```',
          '',
          '範例：',
          '```',
          '>pt 困史A @夜夜 本尊 @pondada main',
          '>pt layer 困史A add 困難史烏',
          '>pt weight 困史A @夜夜 本尊 2',
          '```'
        ].join('\n')
      );
    }
  
    if (topic === 'bind') {
      return message.reply(
        [
          '🔗 角色綁定相關指令',
          '',
          '```',
          '>bind @人 錢包地址 角色名稱 別名',
          '將 Discord 使用者綁定到 MSU 角色',
          '',
          '別名可以不填，不填預設 main',
          '',
          '只有 BOT OWNER 可以使用這個指令',
          '```',
          '',
          '範例：',
          '```',
          '>bind @夜夜 0xf068... CloudDarling main',
          '>bind @pondada 0x1234... MaplePonda main',
          '```',
          '',
          '補充：',
          '```',
          '一個 Discord 可以綁多個角色',
          'main 會成為預設角色',
          '之後 raffle / history / pt 會用別名找角色',
          '```'
        ].join('\n')
      );
    }
  
    if (topic === 'card') {
      return message.reply(
        [
          '🪪 名片相關',
          '',
          '```',
          '/mychars',
          '查看自己綁定的角色',
          '',
          '/char',
          '查看角色名片',
          '',
          '/msu名片',
          '產生 MSU 名片',
          '```'
        ].join('\n')
      );
    }
  
    return message.reply(
      [
        `找不到幫助分類：${topic}`,
        '',
        '可用分類：',
        '```',
        '>msuhelp raffle',
        '>msuhelp pt',
        '>msuhelp bind',
        '>msuhelp card',
        '>msuhelp data',
        '```'
      ].join('\n')
    );
  }
  
  module.exports = {
    name: 'msuhelp',
    execute
  };