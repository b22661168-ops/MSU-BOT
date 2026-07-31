const db = require('./db');
const crypto = require('crypto');
const { getBinding, loadBindings, normalizeBinding } = require('./bindingService');
const { getKnownCharacterByAssetKey } = require('./knownCharacterService');
const { inferDifficulty, inferBossId, resolvePartyDifficulty } = require('./layerCatalog');

function addPartyLayer(partyName, layerId) {
  const now = new Date().toISOString();
  const party = getParty(partyName);
  const layerBossId = inferBossId(layerId);
  if (party?.bossId && layerBossId && party.bossId !== layerBossId) throw new Error('LAYER_BOSS_MISMATCH');

  const existingLayerIds = listPartyLayers(party?.storageName || partyName).map(row => row.layerId);
  if (!existingLayerIds.includes(String(layerId)) && party) {
    for (const member of party.members) {
      assertAvailableSlot(member.assetKey, party.bossId, party.difficulty, party.partyId, [String(layerId)]);
    }
  }

  db.prepare(`
    INSERT INTO party_layers (partyName, layerId, createdAt)
    VALUES (?, ?, ?)
    ON CONFLICT(partyName, layerId) DO NOTHING
  `).run(party?.storageName || partyName, String(layerId), now);

  const allLayerIds = listPartyLayers(party?.storageName || partyName).map(row => row.layerId);
  const difficulty = resolvePartyDifficulty(allLayerIds) || party?.difficulty || null;
  db.prepare(`UPDATE parties SET difficulty = ?, updatedAt = ? WHERE name = ?`).run(difficulty, now, party?.storageName || partyName);
  return listPartyLayers(party?.storageName || partyName);
}

function removePartyLayer(partyName, layerId) {
  const now = new Date().toISOString();
  const result = db.prepare(`DELETE FROM party_layers WHERE partyName = ? AND layerId = ?`)
    .run(partyName, String(layerId));
  if (result.changes > 0) {
    const layerIds = listPartyLayers(partyName).map(row => row.layerId);
    db.prepare(`UPDATE parties SET difficulty = ?, updatedAt = ? WHERE name = ?`)
      .run(resolvePartyDifficulty(layerIds), now, partyName);
  }
  return result.changes;
}

function listPartyLayers(partyName) {
  return db.prepare(`SELECT * FROM party_layers WHERE partyName = ? ORDER BY id ASC`).all(partyName);
}

function resolveCurrentCharacter(discordId, assetKey, fallbackAlias, fallbackName) {
  const binding = getBinding(discordId);
  if (!binding) return null;
  return binding.characters.find(c => c.assetKey === assetKey) ||
    binding.characters.find(c => c.characterName?.toLowerCase() === String(fallbackName || '').toLowerCase()) ||
    binding.characters.find(c => c.alias?.toLowerCase() === String(fallbackAlias || '').toLowerCase()) || null;
}

function hydrateMember(member) {
  const current = member.discordId ? resolveCurrentCharacter(
    member.discordId, member.assetKey, member.alias, member.characterName
  ) : null;
  const known = !current && member.assetKey ? getKnownCharacterByAssetKey(member.assetKey) : null;
  return {
    ...member,
    assetKey: current?.assetKey || known?.assetKey || member.assetKey || null,
    alias: current?.alias || known?.key || member.alias,
    characterName: current?.characterName || known?.characterName || member.characterName || null,
    wallet: current?.wallet || known?.wallet || member.wallet || null,
    sourceType: member.sourceType || (member.discordId ? 'binding' : 'known'),
    bindingFound: Boolean(current),
    knownFound: Boolean(known)
  };
}

function getParty(name) {
  const lookupName = String(name || '').trim();
  if (!lookupName) return null;

  // 相容舊版 prefix 指令與 MSUME PT2：
  // 1. 舊隊伍以 parties.name 儲存。
  // 2. 新隊伍可能以 displayName 對外顯示。
  // 3. Discord 使用者輸入隊名時不應因英文字母大小寫而找不到。
  const rawParty = db.prepare(`
    SELECT *
    FROM parties
    WHERE COALESCE(displayName, name) = ? COLLATE NOCASE
       OR name = ? COLLATE NOCASE
    ORDER BY CASE WHEN COALESCE(status, 'ACTIVE') = 'ACTIVE' THEN 0 ELSE 1 END,
             updatedAt DESC
    LIMIT 1
  `).get(lookupName, lookupName);

  if (!rawParty) return null;

  const members = db.prepare(`
    SELECT * FROM party_members
    WHERE partyName = ?
    ORDER BY sortOrder ASC
  `).all(rawParty.name).map(hydrateMember);

  return { ...normalizePartyRow(rawParty), members };
}

function listParties() {
  return db.prepare(`
    SELECT p.name, p.createdBy, p.createdAt, p.updatedAt,
      COUNT(pm.id) AS memberCount,
      COALESCE(SUM(pm.weight), 0) AS totalWeight
    FROM parties p
    LEFT JOIN party_members pm ON pm.partyName = p.name
    GROUP BY p.name
    ORDER BY p.updatedAt DESC
  `).all();
}

function saveParty(name, createdBy, members) {
  const now = new Date().toISOString();
  const trx = db.transaction(() => {
    db.prepare(`
      INSERT INTO parties (name, createdBy, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET updatedAt = excluded.updatedAt
    `).run(name, createdBy, now, now);

    db.prepare(`DELETE FROM party_members WHERE partyName = ?`).run(name);

    const insertMember = db.prepare(`
      INSERT INTO party_members (
        partyName, discordId, alias, assetKey, characterName,
        weight, sortOrder, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    members.forEach((member, index) => {
      insertMember.run(
        name,
        member.discordId,
        member.alias,
        member.assetKey || null,
        member.characterName || null,
        member.weight ?? 1,
        index + 1,
        now,
        now
      );
    });
  });
  trx();
  return getParty(name);
}

function deleteParty(name) {
  return db.transaction(() => {
    db.prepare(`DELETE FROM party_members WHERE partyName = ?`).run(name);
    return db.prepare(`DELETE FROM parties WHERE name = ?`).run(name).changes;
  })();
}

function updateMemberWeight(partyName, discordId, assetKey, weight, memberId = null) {
  const now = new Date().toISOString();
  const result = memberId != null
    ? db.prepare(`
        UPDATE party_members
        SET weight = ?, updatedAt = ?
        WHERE id = ? AND partyName = ? AND discordId = ?
      `).run(weight, now, memberId, partyName, discordId)
    : db.prepare(`
        UPDATE party_members
        SET weight = ?, updatedAt = ?
        WHERE partyName = ? AND discordId = ? AND assetKey = ?
      `).run(weight, now, partyName, discordId, assetKey);

  if (result.changes > 0) {
    db.prepare(`UPDATE parties SET updatedAt = ? WHERE name = ?`).run(now, partyName);
  }
  return result.changes;
}

function findMember(partyName, discordId, input = null) {
  const members = db.prepare(`
    SELECT * FROM party_members
    WHERE partyName = ? AND discordId = ?
    ORDER BY sortOrder ASC
  `).all(partyName, discordId).map(hydrateMember);

  if (!input) return members.length === 1 ? members[0] : null;
  const text = String(input).toLowerCase();
  return members.find(member =>
    member.assetKey?.toLowerCase() === text ||
    member.characterName?.toLowerCase() === text ||
    member.alias?.toLowerCase() === text
  ) || null;
}

function migrateLegacyPartyMembers() {
  const bindings = loadBindings();
  const rows = db.prepare(`
    SELECT id, discordId, alias, assetKey, characterName
    FROM party_members
    WHERE assetKey IS NULL OR assetKey = ''
  `).all();

  const update = db.prepare(`
    UPDATE party_members
    SET assetKey = ?, characterName = ?, updatedAt = ?
    WHERE id = ?
  `);

  let migrated = 0;
  let unresolved = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    const binding = normalizeBinding(bindings[row.discordId]);
    const text = String(row.alias || '').toLowerCase();
    const character = binding?.characters.find(c =>
      c.alias?.toLowerCase() === text || c.characterName?.toLowerCase() === text
    );
    if (!character) {
      unresolved++;
      continue;
    }
    update.run(character.assetKey, character.characterName, now, row.id);
    migrated++;
  }

  if (rows.length > 0) {
    console.log(`✅ PT V5 migration：${migrated} 筆完成，${unresolved} 筆待人工確認`);
  }
  return { migrated, unresolved };
}

function normalizePartyRow(party) {
  if (!party) return null;
  return {
    ...party,
    storageName: party.name,
    name: party.displayName || party.name
  };
}

function getPartyById(partyId) {
  const rawParty = db.prepare(`SELECT * FROM parties WHERE partyId = ?`).get(partyId);
  if (!rawParty) return null;
  const members = db.prepare(`SELECT * FROM party_members WHERE partyName = ? ORDER BY sortOrder ASC`).all(rawParty.name).map(hydrateMember);
  return { ...normalizePartyRow(rawParty), members };
}

function repairMissingPartyIds() {
  const missing = db.prepare(`SELECT name FROM parties WHERE partyId IS NULL OR TRIM(partyId) = ''`).all();
  if (!missing.length) return 0;
  const update = db.prepare(`UPDATE parties SET partyId = ? WHERE name = ?`);
  const repair = db.transaction(rows => {
    for (const row of rows) update.run(crypto.randomUUID(), row.name);
  });
  repair(missing);
  return missing.length;
}

function listUserParties(discordId, includeAll = false) {
  repairMissingPartyIds();
  const where = includeAll
    ? `COALESCE(p.status, 'ACTIVE') = 'ACTIVE'`
    : `COALESCE(p.status, 'ACTIVE') = 'ACTIVE' AND EXISTS (SELECT 1 FROM party_members pm2 WHERE pm2.partyName = p.name AND pm2.discordId = ?)`;
  const sql = `SELECT p.*, p.name AS storageName, COALESCE(p.displayName, p.name) AS name, COUNT(pm.id) AS memberCount FROM parties p LEFT JOIN party_members pm ON pm.partyName = p.name WHERE ${where} GROUP BY p.name ORDER BY p.updatedAt DESC`;
  return includeAll ? db.prepare(sql).all() : db.prepare(sql).all(discordId);
}

function listArchivedParties(discordId, includeAll = false, months = 3) {
  const safeMonths = Math.max(1, Math.min(Number(months) || 3, 12));
  const where = includeAll
    ? `COALESCE(p.status, 'ACTIVE') = 'ARCHIVED'`
    : `COALESCE(p.status, 'ACTIVE') = 'ARCHIVED' AND EXISTS (SELECT 1 FROM party_members pm2 WHERE pm2.partyName = p.name AND pm2.discordId = ?)`;
  const sql = `SELECT p.*, p.name AS storageName, COALESCE(p.displayName, p.name) AS name, COUNT(pm.id) AS memberCount
    FROM parties p
    LEFT JOIN party_members pm ON pm.partyName = p.name
    WHERE ${where}
      AND datetime(COALESCE(p.archivedAt, p.updatedAt)) >= datetime('now', ?)
    GROUP BY p.name
    ORDER BY COALESCE(p.archivedAt, p.updatedAt) DESC`;
  const offset = `-${safeMonths} months`;
  return includeAll ? db.prepare(sql).all(offset) : db.prepare(sql).all(discordId, offset);
}

function assertAvailableSlot(assetKey, bossId, difficulty, excludePartyId = null, layerIds = []) {
  const normalizedLayers = (layerIds || []).map(String).filter(Boolean);
  let row = null;

  if (normalizedLayers.length) {
    const placeholders = normalizedLayers.map(() => '?').join(',');
    row = db.prepare(`
      SELECT p.name
      FROM parties p
      JOIN party_members pm ON pm.partyName = p.name
      JOIN party_layers pl ON pl.partyName = p.name
      WHERE pm.assetKey = ?
        AND pl.layerId IN (${placeholders})
        AND COALESCE(p.status, 'ACTIVE') = 'ACTIVE'
        AND (? IS NULL OR p.partyId <> ?)
      LIMIT 1
    `).get(assetKey, ...normalizedLayers, excludePartyId, excludePartyId);
  } else if (bossId && difficulty) {
    // 舊資料沒有 party_layers 時，保留 Boss + 難度的相容判斷。
    row = db.prepare(`
      SELECT p.name FROM parties p
      JOIN party_members pm ON pm.partyName = p.name
      WHERE pm.assetKey = ? AND p.bossId = ? AND p.difficulty = ?
        AND COALESCE(p.status, 'ACTIVE') = 'ACTIVE'
        AND (? IS NULL OR p.partyId <> ?)
      LIMIT 1
    `).get(assetKey, bossId, difficulty, excludePartyId, excludePartyId);
  }

  if (row) throw new Error(`DUPLICATE_PT:${row.name}`);
}

function createPartyV2({ name, bossId, difficulty, initialLayerId, leaderDiscordId, memberDiscordId = leaderDiscordId, character, sourceType, sourceKey }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('PARTY_NAME_REQUIRED');
  if (!character?.assetKey) throw new Error('MEMBER_NOT_FOUND');
  const activeDuplicate = db.prepare(`SELECT 1 FROM parties WHERE COALESCE(displayName, name) = ? AND COALESCE(status, 'ACTIVE') = 'ACTIVE' LIMIT 1`).get(cleanName);
  if (activeDuplicate) throw new Error('PARTY_NAME_EXISTS');
  const resolvedBossId = bossId || (initialLayerId ? inferBossId(initialLayerId) : null);
  const resolvedDifficulty = difficulty || (initialLayerId ? inferDifficulty(initialLayerId) : null);
  if (initialLayerId && resolvedBossId && inferBossId(initialLayerId) !== resolvedBossId) throw new Error('LAYER_BOSS_MISMATCH');
  assertAvailableSlot(character.assetKey, resolvedBossId, resolvedDifficulty, null, initialLayerId ? [initialLayerId] : []);
  const now = new Date().toISOString();
  const partyId = crypto.randomUUID();
  const resolvedSourceType = sourceType || (memberDiscordId ? 'binding' : 'known');
  const resolvedSourceKey = sourceKey || character.key || null;
  db.transaction(() => {
    db.prepare(`INSERT INTO parties (name, partyId, bossId, difficulty, leaderDiscordId, leaderAssetKey, status, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`)
      .run(cleanName, partyId, resolvedBossId, resolvedDifficulty, leaderDiscordId, character.assetKey, leaderDiscordId, now, now);
    db.prepare(`INSERT INTO party_members (partyName, discordId, alias, assetKey, characterName, wallet, sourceType, sourceKey, weight, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`)
      .run(cleanName, memberDiscordId || null, character.alias || character.key || character.characterName, character.assetKey, character.characterName, character.wallet || null, resolvedSourceType, resolvedSourceKey, now, now);
    if (initialLayerId) {
      db.prepare(`INSERT INTO party_layers (partyName, layerId, createdAt) VALUES (?, ?, ?)`)
        .run(cleanName, String(initialLayerId), now);
    }
  })();
  return getPartyById(partyId);
}

function addPartyMemberV2(partyId, discordId, character, options = {}) {
  const party = getPartyById(partyId);
  if (!party) throw new Error('PARTY_NOT_FOUND');
  if (party.members.some(m => m.assetKey === character.assetKey)) throw new Error('ALREADY_MEMBER');
  assertAvailableSlot(character.assetKey, party.bossId, party.difficulty, partyId, listPartyLayers(party.storageName || party.name).map(row => row.layerId));
  const now = new Date().toISOString();
  const nextOrder = (party.members.at(-1)?.sortOrder || 0) + 1;
  db.prepare(`INSERT INTO party_members (partyName, discordId, alias, assetKey, characterName, wallet, sourceType, sourceKey, weight, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
    .run(party.storageName || party.name, discordId || null, character.alias || character.key || character.characterName, character.assetKey, character.characterName, character.wallet || null, options.sourceType || (discordId ? 'binding' : 'known'), options.sourceKey || character.key || null, nextOrder, now, now);
  db.prepare(`UPDATE parties SET updatedAt = ? WHERE partyId = ?`).run(now, partyId);
  return getPartyById(partyId);
}

function removePartyMemberV2(partyId, assetKey) {
  const party = getPartyById(partyId);
  if (!party) throw new Error('PARTY_NOT_FOUND');
  if (party.leaderAssetKey === assetKey) throw new Error('CANNOT_REMOVE_LEADER');
  const result = db.prepare(`DELETE FROM party_members WHERE partyName = ? AND assetKey = ?`).run(party.storageName || party.name, assetKey);
  db.prepare(`UPDATE parties SET updatedAt = ? WHERE partyId = ?`).run(new Date().toISOString(), partyId);
  return result.changes;
}

function leavePartyV2(partyId, discordId, assetKey) {
  const party = getPartyById(partyId);
  if (!party) throw new Error('PARTY_NOT_FOUND');
  if (party.leaderDiscordId === discordId && party.leaderAssetKey === assetKey) throw new Error('LEADER_CANNOT_LEAVE');
  return removePartyMemberV2(partyId, assetKey);
}

function archivePartyV2(partyId) {
  const party = getPartyById(partyId);
  if (!party) return 0;
  if (party.status === 'ARCHIVED') return 0;

  const now = new Date().toISOString();
  const stamp = now.replace(/[-:.TZ]/g, '').slice(0, 14);
  const oldStorageName = party.storageName || party.name;
  const archivedStorageName = `${party.name}__ARCHIVED__${stamp}__${String(partyId).slice(0, 8)}`;

  return db.transaction(() => {
    db.pragma('defer_foreign_keys = ON');
    db.prepare(`UPDATE party_members SET partyName = ? WHERE partyName = ?`).run(archivedStorageName, oldStorageName);
    db.prepare(`UPDATE party_layers SET partyName = ? WHERE partyName = ?`).run(archivedStorageName, oldStorageName);
    db.prepare(`UPDATE settlement_records SET partyName = ? WHERE partyName = ?`).run(archivedStorageName, oldStorageName);
    db.prepare(`UPDATE settlement_sessions SET partyName = ? WHERE partyName = ?`).run(archivedStorageName, oldStorageName);
    return db.prepare(`UPDATE parties SET name = ?, displayName = ?, status = 'ARCHIVED', archivedAt = ?, updatedAt = ? WHERE partyId = ?`)
      .run(archivedStorageName, party.name, now, now, partyId).changes;
  })();
}


function addKnownCharacterToParty(partyId, knownCharacter) {
  if (!knownCharacter?.assetKey || !knownCharacter?.wallet) throw new Error('KNOWNCHAR_INVALID');
  return addPartyMemberV2(partyId, null, knownCharacter, { sourceType: 'known', sourceKey: knownCharacter.key });
}

function transferPartyLeader(partyId, targetAssetKey) {
  const party = getPartyById(partyId);
  if (!party) throw new Error('PARTY_NOT_FOUND');
  const target = party.members.find(m => m.assetKey === targetAssetKey);
  if (!target) throw new Error('MEMBER_NOT_FOUND');
  if (!target.discordId) throw new Error('KNOWNCHAR_CANNOT_LEAD');
  const now = new Date().toISOString();
  db.prepare(`UPDATE parties SET leaderDiscordId = ?, leaderAssetKey = ?, updatedAt = ? WHERE partyId = ?`)
    .run(target.discordId, target.assetKey, now, partyId);
  return getPartyById(partyId);
}

function clearPartyLayers(partyName) {
  return db.prepare(`DELETE FROM party_layers WHERE partyName = ?`).run(partyName).changes;
}

function updatePartyV2(partyId, changes = {}) {
  const party = getPartyById(partyId);
  if (!party) throw new Error('PARTY_NOT_FOUND');
  const nextName = String(changes.name ?? party.name).trim();
  const nextBoss = changes.bossId ?? party.bossId;
  const nextDifficulty = changes.difficulty ?? party.difficulty;
  if (!nextName) throw new Error('PARTY_NAME_REQUIRED');
  const duplicate = db.prepare(`SELECT partyId FROM parties WHERE COALESCE(displayName, name) = ? AND partyId <> ? AND COALESCE(status, 'ACTIVE') = 'ACTIVE'`).get(nextName, partyId);
  if (duplicate) throw new Error('PARTY_NAME_EXISTS');
  if (nextBoss !== party.bossId || nextDifficulty !== party.difficulty) {
    for (const member of party.members) assertAvailableSlot(member.assetKey, nextBoss, nextDifficulty, partyId);
  }
  const now = new Date().toISOString();
  db.transaction(() => {
    db.pragma('defer_foreign_keys = ON');
    const currentStorageName = party.storageName || party.name;
    if (nextName !== party.name) {
      db.prepare(`UPDATE party_members SET partyName = ? WHERE partyName = ?`).run(nextName, currentStorageName);
      db.prepare(`UPDATE party_layers SET partyName = ? WHERE partyName = ?`).run(nextName, currentStorageName);
      db.prepare(`UPDATE settlement_records SET partyName = ? WHERE partyName = ?`).run(nextName, currentStorageName);
      db.prepare(`UPDATE settlement_sessions SET partyName = ? WHERE partyName = ?`).run(nextName, currentStorageName);
    }
    db.prepare(`UPDATE parties SET name = ?, displayName = ?, bossId = ?, difficulty = ?, updatedAt = ? WHERE partyId = ?`)
      .run(nextName, nextName, nextBoss, nextDifficulty, now, partyId);
    if (nextBoss !== party.bossId || nextDifficulty !== party.difficulty) clearPartyLayers(nextName);
  })();
  return getPartyById(partyId);
}

function findPartiesByDiscord(discordId) {
  return db.prepare(`SELECT DISTINCT p.* FROM parties p JOIN party_members pm ON pm.partyName = p.name WHERE pm.discordId = ? AND COALESCE(p.status,'ACTIVE')='ACTIVE' ORDER BY p.updatedAt DESC`).all(discordId);
}

function canManageParty(party, discordId, ownerId) {
  return discordId === ownerId || party?.leaderDiscordId === discordId;
}

module.exports = {
  getParty,
  listParties,
  saveParty,
  deleteParty,
  updateMemberWeight,
  findMember,
  addPartyLayer,
  removePartyLayer,
  listPartyLayers,
  migrateLegacyPartyMembers,
  getPartyById,
  listUserParties,
  listArchivedParties,
  createPartyV2,
  addPartyMemberV2,
  removePartyMemberV2,
  leavePartyV2,
  archivePartyV2,
  canManageParty,
  addKnownCharacterToParty,
  transferPartyLeader,
  updatePartyV2,
  clearPartyLayers,
  findPartiesByDiscord
};
