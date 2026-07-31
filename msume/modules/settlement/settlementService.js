'use strict';

const db = require('../../../services/db');
const { getPartyById, listPartyLayers, listUserParties } = require('../../../services/partyService');
const { normalizeIdentity, calculateTransferPlan } = require('./transferCalculator');
const storage = require('./settlementStorage');

function normalizeDate(input) {
  const match = String(input || '').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isWinState(state) {
  return state === 'RAFFLE_STATE_PENDING_CLAIM' || state === 'RAFFLE_STATE_CLAIMED';
}

function finalCount(prize, state) {
  const received = Number(prize.receivedCount?.value || 0);
  const won = Number(prize.winCount?.value || 0);
  return state === 'RAFFLE_STATE_PENDING_CLAIM' ? won : received;
}

function extractNeso(rawJson, allowedLayerIds) {
  const raw = JSON.parse(rawJson);
  let total = 0;
  for (const history of raw?.data?.histories || []) {
    if (!allowedLayerIds.includes(String(history.layerId)) || !isWinState(history.state)) continue;
    for (const prize of history.prizes || []) {
      if (Number(prize.rewardKey?.itemId) !== 1) continue;
      const count = finalCount(prize, history.state);
      if (count > 0) total += Math.floor(count);
    }
  }
  return total;
}

function getHistoryRow(member, settledDate) {
  const legacyRaffledAt = `${settledDate}T00:00:00Z`;

  // 抽獎中心目前以 YYYY-MM-DD 儲存；舊版部分資料可能含 T00:00:00Z。
  // 優先使用 assetKey + wallet，避免「本尊／main」等重複別名抓錯角色。
  if (member.assetKey && member.wallet) {
    const row = db.prepare(`
      SELECT *
      FROM raffle_history_results
      WHERE assetKey = ?
        AND wallet = ? COLLATE NOCASE
        AND raffledAt IN (?, ?)
      ORDER BY CASE WHEN raffledAt = ? THEN 0 ELSE 1 END, syncedAt DESC
      LIMIT 1
    `).get(member.assetKey, member.wallet, settledDate, legacyRaffledAt, settledDate);
    if (row) return row;
  }

  // 僅在缺少完整角色識別資料時使用備援；加入 characterName 避免 alias 重複誤配。
  if (member.discordId && member.characterName) {
    const row = db.prepare(`
      SELECT *
      FROM raffle_history_results
      WHERE discordId = ?
        AND characterName = ? COLLATE NOCASE
        AND raffledAt IN (?, ?)
      ORDER BY CASE WHEN raffledAt = ? THEN 0 ELSE 1 END, syncedAt DESC
      LIMIT 1
    `).get(member.discordId, member.characterName, settledDate, legacyRaffledAt, settledDate);
    if (row) return row;
  }

  return null;
}

function recalculateDraft(draft) {
  const totalWeight = draft.members.reduce((sum, member) => sum + Number(member.weight || 0), 0);
  const totalNeso = draft.members.reduce((sum, member) => sum + Number(member.actual || 0), 0);
  let distributed = 0;
  const positive = draft.members.filter(member => Number(member.weight || 0) > 0);

  for (const member of draft.members) {
    member.expected = 0;
    if (totalWeight <= 0 || Number(member.weight || 0) <= 0) continue;
    const isLast = positive[positive.length - 1] === member;
    member.expected = isLast ? totalNeso - distributed : Math.floor(totalNeso * Number(member.weight) / totalWeight);
    distributed += member.expected;
  }

  draft.totalWeight = totalWeight;
  draft.totalNeso = totalNeso;
  return draft;
}

function buildPartyDraft(partyId, settledDate) {
  const party = getPartyById(partyId);
  if (!party) throw new Error('PARTY_NOT_FOUND');
  const layerIds = listPartyLayers(party.storageName || party.name).map(row => String(row.layerId));
  if (!layerIds.length) throw new Error('NO_PARTY_LAYERS');

  const missing = [];
  const members = party.members.map(member => {
    const row = getHistoryRow(member, settledDate);
    let actual = 0;
    if (!row) missing.push(`${member.characterName || member.alias}：查無 ${settledDate} 快取`);
    else {
      try { actual = extractNeso(row.rawJson, layerIds); }
      catch { missing.push(`${member.characterName || member.alias}：抽獎資料解析失敗`); }
    }
    const normalized = {
      discordId: member.discordId || null,
      assetKey: member.assetKey || null,
      alias: member.alias || member.characterName || '未命名',
      characterName: member.characterName || member.alias || '未命名',
      wallet: member.wallet || null,
      weight: Number(member.weight ?? 1),
      actual,
      expected: 0
    };
    normalized.identityKey = normalizeIdentity(normalized);
    return normalized;
  });

  return recalculateDraft({ partyId, partyName: party.name, settledDate, layerIds, members, missing, totalNeso: 0, totalWeight: 0 });
}

function applyWeightText(draft, text) {
  const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const updates = new Map();
  for (const line of lines) {
    const match = line.match(/^(.+?)\s*[=:：]\s*(\d+(?:\.\d+)?)$/);
    if (!match) throw new Error(`WEIGHT_FORMAT:${line}`);
    const key = match[1].trim().toLowerCase();
    const value = Number(match[2]);
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`WEIGHT_VALUE:${line}`);
    updates.set(key, value);
  }
  for (const member of draft.members) {
    const characterKey = member.characterName ? String(member.characterName).toLowerCase() : null;
    if (characterKey && updates.has(characterKey)) {
      member.weight = updates.get(characterKey);
      continue;
    }

    // 相容舊輸入，但只有別名在隊伍內唯一時才允許，避免「本尊／main」同時改到多人。
    const aliasKey = member.alias ? String(member.alias).toLowerCase() : null;
    if (!aliasKey || !updates.has(aliasKey)) continue;
    const sameAliasCount = draft.members.filter(item => String(item.alias || '').toLowerCase() === aliasKey).length;
    if (sameAliasCount === 1) member.weight = updates.get(aliasKey);
  }
  return recalculateDraft(draft);
}

function saveDraft(draft, ownerId) { return storage.saveSettlement(recalculateDraft(draft), ownerId); }

function isAdminInteraction(interaction) {
  if (interaction?.user?.id === process.env.OWNER_ID) return true;
  return Boolean(
    interaction?.memberPermissions?.has?.('Administrator') ||
    interaction?.memberPermissions?.has?.('ManageGuild')
  );
}

function manageableParties(discordId, isAdmin = false) {
  const parties = listUserParties(discordId, isAdmin);
  return isAdmin ? parties : parties.filter(p => p.leaderDiscordId === discordId);
}

function canManagePartyId(partyId, discordId, isAdmin = false) {
  if (isAdmin) return true;
  const party = getPartyById(partyId);
  return Boolean(party && party.leaderDiscordId === discordId);
}

function canManageSettlement(settlement, discordId, isAdmin = false) {
  return Boolean(settlement && canManagePartyId(settlement.partyId, discordId, isAdmin));
}

function listPendingFor(discordId, isAdmin = false) {
  const partyIds = manageableParties(discordId, isAdmin).map(p => p.partyId);
  return storage.listSettlements({ status: 'PENDING', partyIds, limit: 25 });
}

function listRecentFor(discordId, isAdmin = false) {
  if (isAdmin) return storage.listSettlements({ limit: 25 });
  const managed = manageableParties(discordId, false).map(p => p.partyId);
  const own = storage.listSettlements({ discordId, limit: 25 });
  const full = storage.listSettlements({ partyIds: managed, limit: 25 });
  const map = new Map([...full, ...own].map(s => [s.id, s]));
  return [...map.values()].sort((a, b) => String(b.settledDate).localeCompare(String(a.settledDate))).slice(0, 25);
}

function buildPlan(ids) {
  const settlements = ids.map(storage.getSettlement).filter(Boolean);
  if (!settlements.length) throw new Error('NO_SETTLEMENTS');
  return { settlements, plan: calculateTransferPlan(settlements) };
}

module.exports = {
  normalizeDate, buildPartyDraft, recalculateDraft, applyWeightText, saveDraft, buildPlan,
  isAdminInteraction, manageableParties, canManagePartyId, canManageSettlement,
  listPendingFor, listRecentFor, ...storage
};
