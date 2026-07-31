const itemNames = require('../data/itemNames.json');
const rewardValues = require('../data/rewardValues.json');
const db = require('./db');

const {
  listPartyLayers
} = require('./partyService');

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
  
  function findPartyItemRewards(party, settledDate, itemKeyword) {
    const partyLayers = listPartyLayers(party.name);
  
    if (partyLayers.length === 0) {
      return {
        ok: false,
        error: 'NO_PARTY_LAYERS',
        message: `隊伍 ${party.name} 尚未設定統計 Layer`
      };
    }
  
    const allowedLayerIds = partyLayers.map(x => String(x.layerId));
    const results = [];
    const missing = [];
  
    for (const member of party.members) {
      const row = getCachedHistory(member, settledDate);
  
      if (!row) {
        missing.push(`<@${member.discordId}>｜${member.alias} 查無抽獎歷史快取`);
        continue;
      }
  
      let raw;
  
      try {
        raw = JSON.parse(row.rawJson);
      } catch {
        missing.push(`<@${member.discordId}>｜${member.alias} 抽獎資料解析失敗`);
        continue;
      }
  
      const histories = raw?.data?.histories || [];
  
      for (const history of histories) {
        if (!allowedLayerIds.includes(String(history.layerId))) continue;
        if (!isWinState(history.state)) continue;
  
        for (const prize of history.prizes || []) {
          const count = getFinalCount(prize, history.state);
          if (count <= 0) continue;
  
          const itemId = prize.rewardKey?.itemId;
          const rotationId = prize.rewardKey?.rotationId || 0;
  
          if (itemId === 1) continue;
  
          const itemName = getRewardDisplayName(itemId, rotationId, history.layerId);
  
          if (!itemName.includes(itemKeyword)) continue;
  
          const existing = results.find(x =>
            x.discordId === member.discordId &&
            x.alias === member.alias &&
            x.itemName === itemName
          );
          
          if (existing) {
            existing.quantity += count;
          } else {
            results.push({
              discordId: member.discordId,
              alias: member.alias,
              itemName,
              quantity: count,
              mode: guessItemMode(itemName)
            });
          }
        }
      }
    }
  
    return {
      ok: true,
      partyName: party.name,
      settledDate,
      itemKeyword,
      results,
      missing
    };
  }

  function guessItemMode(itemName) {
    if (itemName === 'NESO') return 'AUTO_NESO';
  
    if (
      itemName.includes('幣') ||
      itemName.includes('代幣')
    ) {
      return 'EVEN_ITEM';
    }
  
    return 'PRICE_ITEM';
  }

function toRaffledAt(date) {
  return `${date}T00:00:00Z`;
}

function getCachedHistory(member, settledDate) {
  return db.prepare(`
    SELECT *
    FROM raffle_history_results
    WHERE discordId = ?
      AND alias = ?
      AND raffledAt = ?
    ORDER BY syncedAt DESC
    LIMIT 1
  `).get(
    member.discordId,
    member.alias,
    toRaffledAt(settledDate)
  );
}

function extractNesoFromHistory(rawJson, allowedLayerIds) {
  const raw = JSON.parse(rawJson);
  const histories = raw?.data?.histories || [];

  let total = 0;

  for (const history of histories) {
    if (!allowedLayerIds.includes(String(history.layerId))) continue;
    if (!isWinState(history.state)) continue;

    for (const prize of history.prizes || []) {
      const itemId = prize.rewardKey?.itemId;
      if (itemId !== 1) continue;

      const count = getFinalCount(prize, history.state);
      if (count > 0) total += Math.floor(count);
    }
  }

  return total;
}

function calculateTransfers(members) {
  const payers = members
    .filter(m => m.diff > 0)
    .map(m => ({
      discordId: m.discordId,
      alias: m.alias,
      remain: m.diff
    }));

  const receivers = members
    .filter(m => m.diff < 0)
    .map(m => ({
      discordId: m.discordId,
      alias: m.alias,
      need: Math.abs(m.diff)
    }));

  const transfers = [];

  for (const payer of payers) {
    for (const receiver of receivers) {
      if (payer.remain <= 0) break;
      if (receiver.need <= 0) continue;

      const amount = Math.min(payer.remain, receiver.need);

      transfers.push({
        fromDiscordId: payer.discordId,
        fromAlias: payer.alias,
        toDiscordId: receiver.discordId,
        toAlias: receiver.alias,
        amount
      });

      payer.remain -= amount;
      receiver.need -= amount;
    }
  }

  return transfers;
}

function calculateNesoSettlement(party, settledDate) {
  const partyLayers = listPartyLayers(party.name);

  if (partyLayers.length === 0) {
    return {
      ok: false,
      error: 'NO_PARTY_LAYERS',
      message: `隊伍 ${party.name} 尚未設定統計 Layer`
    };
  }

  const allowedLayerIds = partyLayers.map(x => String(x.layerId));

  const members = party.members.map(member => ({
    discordId: member.discordId,
    alias: member.alias,
    weight: Number(member.weight || 0),
    actual: 0,
    expected: 0,
    diff: 0
  }));

  const missing = [];

  for (const member of members) {
    const row = getCachedHistory(member, settledDate);

    if (!row) {
      missing.push(`<@${member.discordId}>｜${member.alias} 查無抽獎歷史快取`);
      continue;
    }

    try {
      member.actual = extractNesoFromHistory(row.rawJson, allowedLayerIds);
    } catch (error) {
      missing.push(`<@${member.discordId}>｜${member.alias} 抽獎資料解析失敗`);
    }
  }

  const totalActual = members.reduce((sum, m) => sum + m.actual, 0);
  const totalWeight = members.reduce((sum, m) => sum + m.weight, 0);

  let distributed = 0;

  for (let i = 0; i < members.length; i++) {
    const member = members[i];

    if (totalWeight <= 0) {
      member.expected = 0;
    } else if (i === members.length - 1) {
      member.expected = totalActual - distributed;
    } else {
      member.expected = Math.floor(totalActual * member.weight / totalWeight);
      distributed += member.expected;
    }

    member.diff = member.actual - member.expected;
  }

  const transfers = calculateTransfers(members);

  return {
    ok: true,
    type: 'NESO_ONLY',
    partyName: party.name,
    settledDate,
    totalActual,
    totalWeight,
    members,
    transfers,
    missing
  };
}

function calculateEvenItems(session, memberCount) {
    const evenItems = session.items.filter(item =>
      item.mode === 'EVEN_ITEM'
    );
  
    const itemMap = new Map();
  
    for (const item of evenItems) {
      if (!itemMap.has(item.itemName)) {
        itemMap.set(item.itemName, {
          itemName: item.itemName,
          totalQuantity: 0,
          owners: []
        });
      }
  
      const entry = itemMap.get(item.itemName);
  
      const quantity = Number(item.quantity || 0);
  
      entry.totalQuantity += quantity;
  
      entry.owners.push({
        discordId: item.ownerDiscordId,
        quantity
      });
    }
  
    return [...itemMap.values()].map(entry => {
        const each = memberCount > 0
          ? Math.floor(entry.totalQuantity / memberCount)
          : 0;
      
        const remain = memberCount > 0
          ? entry.totalQuantity % memberCount
          : entry.totalQuantity;
      
        return {
          ...entry,
          memberCount,
          each,
          remain
        };
      });
  }

module.exports = {
  calculateNesoSettlement,
  findPartyItemRewards,
  calculateEvenItems,
};