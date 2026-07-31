const {
    loadBindings
  } = require('../services/bindingService');
const {
    getParty
  } = require('../services/partyService');
  
  const {
    getOrCreateSession,
    getSessionWithItems,
    addOrUpdateItem,
    updateItemPrice
  } = require('../services/settlementService');
  
  const {
    calculateNesoSettlement,
    findPartyItemRewards,
    calculateEvenItems
  } = require('../services/settlementCalculator');
  
  function normalizeDate(input) {
    if (!input) return null;
  
    const fixed = input.replace(/\//g, '-');
    const match = fixed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  
    if (!match) return null;
  
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  
  function parsePrice(input) {
    if (!input) return null;
  
    const text = String(input).replace(/,/g, '').trim();
  
    if (/^\d+(\.\d+)?[mM]$/.test(text)) {
      return Math.floor(Number(text.slice(0, -1)) * 1000000);
    }
  
    if (/^\d+(\.\d+)?[kK]$/.test(text)) {
      return Math.floor(Number(text.slice(0, -1)) * 1000);
    }
  
    const value = Number(text);
  
    if (!Number.isFinite(value) || value < 0) return null;
  
    return Math.floor(value);
  }

  function getCharacterByAlias(data, alias) {
    if (!data) return null;
  
    if (Array.isArray(data.characters)) {
      return data.characters.find(c =>
        c.alias?.toLowerCase() === alias.toLowerCase()
      );
    }
  
    if (!alias || alias === 'main') {
      return {
        alias: 'main',
        wallet: data.wallet,
        characterName: data.characterName
      };
    }
  
    return null;
  }
  
  function buildMemberInfoMap(result) {
    const bindings = loadBindings();
    const map = new Map();
  
    for (const member of result.members) {
      const data = bindings[member.discordId];
      const character = getCharacterByAlias(data, member.alias);
  
      const displayName =
        character?.characterName
          ? `${character.characterName}（${member.alias}）`
          : `<@${member.discordId}>（${member.alias}）`;
  
      map.set(member.discordId, {
        discordId: member.discordId,
        alias: member.alias,
        displayName,
        wallet: character?.wallet || null
      });
    }
  
    return map;
  }
  
  function getMemberInfo(infoMap, discordId) {
    return infoMap.get(discordId) || {
      discordId,
      displayName: `<@${discordId}>`,
      wallet: null
    };
  }

function formatPreview(result) {
  const infoMap = buildMemberInfoMap(result);

  const memberLines = result.members.map(m => {
    const info = getMemberInfo(infoMap, m.discordId);

    const diffText = m.diff > 0
      ? `多拿 ${m.diff.toLocaleString()}`
      : m.diff < 0
        ? `少拿 ${Math.abs(m.diff).toLocaleString()}`
        : '剛好';

    return [
      info.displayName,
      `權重 ${m.weight}`,
      `實拿 ${m.actual.toLocaleString()}`,
      `應得 ${m.expected.toLocaleString()}`,
      diffText
    ].join('｜');
  });

  const transferLines = result.transfers.length > 0
    ? result.transfers.map((t, index) => {
        const from = getMemberInfo(infoMap, t.fromDiscordId);
        const to = getMemberInfo(infoMap, t.toDiscordId);

        return [
          `${index + 1}. ${from.displayName} → ${to.displayName}`,
          `金額：${t.amount.toLocaleString()} NESO`,
          to.wallet
            ? `收款錢包：\`${to.wallet}\``
            : `收款錢包：查無資料，請手動確認`
        ].join('\n');
      })
    : ['無需轉帳'];

  return [
    `📦 ${result.partyName} 分寶預覽`,
    `日期：${result.settledDate}`,
    `模式：NESO_ONLY`,
    '',
    `💰 NESO 總額：${result.totalActual.toLocaleString()}`,
    `總權重：${result.totalWeight}`,
    '',
    `👥 成員明細`,
    '```',
    memberLines.join('\n') || '無',
    '```',
    '',
    `💸 建議轉帳`,
    '```',
    transferLines.join('\n\n'),
    '```',
    result.missing.length > 0
      ? `\n⚠️ 缺漏資料：\n${result.missing.join('\n')}`
      : ''
  ].join('\n');
}
  
function formatPaymentList(result) {
    const infoMap = buildMemberInfoMap(result);
  
    const payerGroups = new Map();
  
    for (const transfer of result.transfers) {
      if (!payerGroups.has(transfer.fromDiscordId)) {
        payerGroups.set(transfer.fromDiscordId, []);
      }
  
      payerGroups.get(transfer.fromDiscordId).push(transfer);
    }
  
    if (result.transfers.length === 0) {
      return [
        `📦 ${result.partyName}｜${result.settledDate}`,
        '',
        '目前無需轉帳。',
        '',
        '⚠️ 預覽，尚未鎖定。'
      ].join('\n');
    }
  
    const sections = [];
  
    for (const [payerId, transfers] of payerGroups.entries()) {
      const payer = getMemberInfo(infoMap, payerId);
      const total = transfers.reduce((sum, t) => sum + t.amount, 0);
  
      sections.push(`💸 ${payer.displayName}（${total.toLocaleString()}）`);
      sections.push('');
  
      for (const transfer of transfers) {
        const receiver = getMemberInfo(infoMap, transfer.toDiscordId);
  
        sections.push(
          `➡ ${receiver.displayName}｜${transfer.amount.toLocaleString()}`
        );
  
        sections.push(
          receiver.wallet
            ? `\`${receiver.wallet}\``
            : '`查無錢包資料`'
        );
  
        sections.push('');
      }
    }
  
    return [
      `📦 ${result.partyName}｜${result.settledDate}`,
      `💰 單位：NESO`,
      '',
      ...sections,
      '⚠️ 預覽，尚未鎖定。'
    ].join('\n');
  }

  function formatAddResult(result, addedItems) {
    if (result.results.length === 0) {
      return [
        `❌ ${result.partyName}｜${result.settledDate}`,
        `找不到符合「${result.itemKeyword}」的中獎物品。`,
        result.missing.length > 0
          ? `\n⚠️ 缺漏資料：\n${result.missing.join('\n')}`
          : ''
      ].join('\n');
    }
  
    const lines = addedItems.map(item => {
      return [
        `${item.itemName} ×${item.quantity}`,
        `持有人：<@${item.ownerDiscordId}>`,
        `模式：${item.mode}`
      ].join('\n');
    });
  
    return [
      `✅ 已加入分寶項目`,
      `📦 ${result.partyName}｜${result.settledDate}`,
      '',
      lines.join('\n\n'),
      result.missing.length > 0
        ? `\n⚠️ 缺漏資料：\n${result.missing.join('\n')}`
        : ''
    ].join('\n');
  }

  function formatSession(session) {
    const party = getParty(session.partyName);
    const memberCount = party?.members?.length || 0;
    const evenItemResults = calculateEvenItems(session, memberCount);
    
    const evenItems = new Map();
    const priceItems = new Map();
    const otherItems = new Map();
  
    for (const item of session.items || []) {
      let targetMap = otherItems;
  
      if (item.mode === 'EVEN_ITEM') targetMap = evenItems;
      else if (item.mode === 'PRICE_ITEM') targetMap = priceItems;
  
      const key = item.itemName;
  
      if (!targetMap.has(key)) {
        targetMap.set(key, {
          quantity: 0,
          owners: new Map()
        });
      }
  
      const entry = targetMap.get(key);
      entry.quantity += Number(item.quantity || 0);
  
      if (item.ownerDiscordId) {
        if (!entry.owners.has(item.ownerDiscordId)) {
          entry.owners.set(item.ownerDiscordId, 0);
        }
  
        entry.owners.set(
          item.ownerDiscordId,
          entry.owners.get(item.ownerDiscordId) + Number(item.quantity || 0)
        );
      }
    }
  
    function formatGroup(title, map, emptyText) {
        if (map.size === 0) {
          return [`${title}`, emptyText].join('\n');
        }
      
        const lines = [];
      
        for (const [itemName, entry] of map.entries()) {
          lines.push(`✔ ${itemName} ×${entry.quantity}`);
      
          const ownerLines = [...entry.owners.entries()].map(([discordId, qty]) =>
            `　<@${discordId}> ×${qty}`
          );
      
          if (ownerLines.length > 0) {
            lines.push(ownerLines.join('\n'));
          }
        }
      
        return [`${title}`, lines.join('\n')].join('\n');
      }
  
    function formatEvenItems(items) {
        if (!items || items.length === 0) {
          return [
            '🪙 均分物品',
            '目前無'
          ].join('\n');
        }
      
        const lines = [];
      
        for (const item of items) {
          lines.push(
            `✔ ${item.itemName} ×${item.totalQuantity}｜每人 ${item.each}｜剩餘 ${item.remain}`
          );
      
          for (const owner of item.owners) {
            lines.push(`　<@${owner.discordId}> ×${owner.quantity}`);
          }
        }
      
        return [
          '🪙 均分物品',
          lines.join('\n')
        ].join('\n');
      }

    return [
      `📦 ${session.partyName}｜${session.settledDate}`,
      `狀態：${session.status}`,
      '',
      `💰 自動分配`,
      '✔ NESO',
      '',
      formatEvenItems(evenItemResults),
      '',
      formatGroup('💎 待估價物品', priceItems, '目前無'),
      '',
      otherItems.size > 0
        ? formatGroup('📌 其他', otherItems, '目前無')
        : '',
      '',
      '下一步：',
      '`>split add 隊伍名 日期 物品名稱` 加入物品',
      '`>split 隊伍名 日期` 查看付款清單'
    ].filter(Boolean).join('\n');
  }

    async function execute(message, args) {
        const sub = args[1]?.toLowerCase();
      
        if (!sub || sub === 'help') {
          return message.reply(
            [
              '📦 分寶指令',
              '',
              '`>split 隊伍名 日期` 查看付款清單',
              '`>split preview 隊伍名 日期` 查看完整計算',
              '',
              '例如：',
              '`>split 困露A 2026-06-25`',
              '`>split preview 困露A 2026-06-25`'
            ].join('\n')
          );
        }
      
        if (sub === 'preview') {
          const partyName = args[2];
          const settledDate = normalizeDate(args[3]);
      
          if (!partyName || !settledDate) {
            return message.reply(
              '格式：`>split preview 隊伍名 日期`\n例如：`>split preview 困露A 2026-06-25`'
            );
          }
      
          const party = getParty(partyName);
      
          if (!party) {
            return message.reply(`找不到隊伍：${partyName}`);
          }
      
          getOrCreateSession(party.name, settledDate, message.author.id);
      
          const result = calculateNesoSettlement(party, settledDate);
      
          if (!result.ok) {
            return message.reply(`❌ ${result.message || '分寶計算失敗'}`);
          }
      
          return message.reply(formatPreview(result));
        }
      
        if (sub === 'add') {
            const partyName = args[2];
            const settledDate = normalizeDate(args[3]);
            const itemKeyword = args.slice(4).join(' ');
        
            if (!partyName || !settledDate || !itemKeyword) {
              return message.reply(
                '格式：`>split add 隊伍名 日期 物品名稱`\n例如：`>split add 困露A 2026-06-25 露幣`'
              );
            }
        
            const party = getParty(partyName);
        
            if (!party) {
              return message.reply(`找不到隊伍：${partyName}`);
            }
        
            const session = getOrCreateSession(
              party.name,
              settledDate,
              message.author.id
            );
        
            const result = findPartyItemRewards(
              party,
              settledDate,
              itemKeyword
            );
        
            if (!result.ok) {
              return message.reply(`❌ ${result.message || '搜尋分寶物品失敗'}`);
            }
        
            const addedItems = [];
        
            for (const reward of result.results) {
              const item = addOrUpdateItem({
                sessionId: session.id,
                itemName: reward.itemName,
                quantity: reward.quantity,
                ownerDiscordId: reward.discordId,
                mode: reward.mode,
                price: 0,
                remainingQuantity: 0,
                createdBy: message.author.id
              });
        
              addedItems.push(item);
            }
        
            return message.reply(formatAddResult(result, addedItems));
          }

          if (sub === 'price') {
            const partyName = args[2];
            const settledDate = normalizeDate(args[3]);
            const price = parsePrice(args[args.length - 1]);
            const itemName = args.slice(4, -1).join(' ');
        
            if (!partyName || !settledDate || !itemName || price === null) {
              return message.reply(
                [
                  '格式：',
                  '`>split price 隊伍名 日期 物品名稱 成交價`',
                  '',
                  '例如：',
                  '`>split price 困露A 2026-06-25 露幣 12M`',
                  '`>split price 困露A 2026-06-25 航海披風 120000000`'
                ].join('\n')
              );
            }
        
            const party = getParty(partyName);
        
            if (!party) {
              return message.reply(`找不到隊伍：${partyName}`);
            }
        
            const session = getSessionWithItems(party.name, settledDate);
        
            if (!session) {
              return message.reply(
                `找不到分寶單：${party.name}｜${settledDate}\n請先使用：\`>split add ${party.name} ${settledDate} 物品名稱\``
              );
            }
        
            const result = updateItemPrice({
              sessionId: session.id,
              itemName,
              price,
              updatedBy: message.author.id
            });
        
            if (!result.ok) {
              return message.reply(`❌ ${result.message}`);
            }
        
            return message.reply(
              [
                `✅ 已更新成交價`,
                `📦 ${party.name}｜${settledDate}`,
                `物品：${itemName}`,
                `成交價：${price.toLocaleString()} NESO`
              ].join('\n')
            );
          }

          if (sub === 'session') {
            const partyName = args[2];
            const settledDate = normalizeDate(args[3]);
        
            if (!partyName || !settledDate) {
              return message.reply(
                '格式：`>split session 隊伍名 日期`\n例如：`>split session 困露A 2026-06-25`'
              );
            }
        
            const party = getParty(partyName);
        
            if (!party) {
              return message.reply(`找不到隊伍：${partyName}`);
            }
        
            const session = getSessionWithItems(party.name, settledDate);
        
            if (!session) {
              return message.reply(
                [
                  `📦 ${party.name}｜${settledDate}`,
                  '目前尚未建立分寶單。',
                  '',
                  '你可以先使用：',
                  `\`>split ${party.name} ${settledDate}\``,
                  '或加入物品：',
                  `\`>split add ${party.name} ${settledDate} 露幣\``
                ].join('\n')
              );
            }
        
            return message.reply(formatSession(session));
          }

        const partyName = args[1];
        const settledDate = normalizeDate(args[2]);
      
        if (partyName && settledDate) {
          const party = getParty(partyName);
      
          if (!party) {
            return message.reply(`找不到隊伍：${partyName}`);
          }
      
          getOrCreateSession(party.name, settledDate, message.author.id);
      
          const result = calculateNesoSettlement(party, settledDate);
      
          if (!result.ok) {
            return message.reply(`❌ ${result.message || '分寶計算失敗'}`);
          }
      
          return message.reply(formatPaymentList(result));
        }
      
        return message.reply('未知 split 指令，請用：`>split help`');
      }

  
  module.exports = {
    name: 'split',
    execute
  };