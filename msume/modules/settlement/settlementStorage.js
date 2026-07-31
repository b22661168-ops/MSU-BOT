'use strict';

const crypto = require('crypto');
const db = require('../../../services/db');

db.exec(`
CREATE TABLE IF NOT EXISTS neso_settlements (
  id TEXT PRIMARY KEY,
  partyId TEXT NOT NULL,
  partyName TEXT NOT NULL,
  settledDate TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  totalNeso INTEGER NOT NULL DEFAULT 0,
  totalWeight REAL NOT NULL DEFAULT 0,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(partyId, settledDate)
);
CREATE TABLE IF NOT EXISTS neso_settlement_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlementId TEXT NOT NULL,
  identityKey TEXT NOT NULL,
  discordId TEXT,
  assetKey TEXT,
  alias TEXT,
  characterName TEXT,
  wallet TEXT,
  weight REAL NOT NULL DEFAULT 1,
  actual INTEGER NOT NULL DEFAULT 0,
  expected INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (settlementId) REFERENCES neso_settlements(id) ON DELETE CASCADE,
  UNIQUE(settlementId, identityKey)
);
CREATE TABLE IF NOT EXISTS neso_transfer_batches (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'OPEN',
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  completedAt TEXT
);
CREATE TABLE IF NOT EXISTS neso_transfer_batch_settlements (
  batchId TEXT NOT NULL,
  settlementId TEXT NOT NULL,
  PRIMARY KEY (batchId, settlementId),
  FOREIGN KEY (batchId) REFERENCES neso_transfer_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (settlementId) REFERENCES neso_settlements(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS neso_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batchId TEXT NOT NULL,
  fromIdentityKey TEXT NOT NULL,
  fromDiscordId TEXT,
  fromCharacterName TEXT,
  fromWallet TEXT,
  toIdentityKey TEXT NOT NULL,
  toDiscordId TEXT,
  toCharacterName TEXT,
  toWallet TEXT,
  amount INTEGER NOT NULL,
  FOREIGN KEY (batchId) REFERENCES neso_transfer_batches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_neso_settlement_status ON neso_settlements(status, settledDate DESC);
`);

function hydrateSettlement(row) {
  if (!row) return null;
  return {
    ...row,
    members: db.prepare(`SELECT * FROM neso_settlement_members WHERE settlementId = ? ORDER BY id`).all(row.id)
  };
}

function saveSettlement(draft, createdBy) {
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT id FROM neso_settlements WHERE partyId = ? AND settledDate = ?`).get(draft.partyId, draft.settledDate);
  const id = existing?.id || crypto.randomUUID();
  db.transaction(() => {
    db.prepare(`
      INSERT INTO neso_settlements (id, partyId, partyName, settledDate, status, totalNeso, totalWeight, createdBy, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)
      ON CONFLICT(partyId, settledDate) DO UPDATE SET
        partyName=excluded.partyName, status='PENDING', totalNeso=excluded.totalNeso,
        totalWeight=excluded.totalWeight, createdBy=excluded.createdBy, updatedAt=excluded.updatedAt
    `).run(id, draft.partyId, draft.partyName, draft.settledDate, draft.totalNeso, draft.totalWeight, createdBy, now, now);
    db.prepare(`DELETE FROM neso_settlement_members WHERE settlementId = ?`).run(id);
    const insert = db.prepare(`INSERT INTO neso_settlement_members
      (settlementId, identityKey, discordId, assetKey, alias, characterName, wallet, weight, actual, expected)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const member of draft.members) {
      insert.run(id, member.identityKey, member.discordId || null, member.assetKey || null, member.alias || null,
        member.characterName || null, member.wallet || null, member.weight, member.actual, member.expected);
    }
  })();
  return getSettlement(id);
}

function getSettlement(id) {
  return hydrateSettlement(db.prepare(`SELECT * FROM neso_settlements WHERE id = ?`).get(id));
}

function listSettlements({ status, limit = 25, partyIds, discordId } = {}) {
  const clauses = [];
  const params = [];
  if (status) { clauses.push('s.status = ?'); params.push(status); }
  if (Array.isArray(partyIds)) {
    if (!partyIds.length) return [];
    clauses.push(`s.partyId IN (${partyIds.map(() => '?').join(',')})`);
    params.push(...partyIds);
  }
  if (discordId) {
    clauses.push(`EXISTS (SELECT 1 FROM neso_settlement_members sm WHERE sm.settlementId=s.id AND sm.discordId=?)`);
    params.push(discordId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT s.* FROM neso_settlements s ${where} ORDER BY s.settledDate DESC, s.updatedAt DESC LIMIT ?`).all(...params, limit);
  return rows.map(hydrateSettlement);
}

function createTransferBatch(settlementIds, plan, createdBy) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`INSERT INTO neso_transfer_batches (id, status, createdBy, createdAt) VALUES (?, 'OPEN', ?, ?)`).run(id, createdBy, now);
    const link = db.prepare(`INSERT INTO neso_transfer_batch_settlements (batchId, settlementId) VALUES (?, ?)`);
    for (const settlementId of settlementIds) link.run(id, settlementId);
    const insert = db.prepare(`INSERT INTO neso_transfers
      (batchId, fromIdentityKey, fromDiscordId, fromCharacterName, fromWallet, toIdentityKey, toDiscordId, toCharacterName, toWallet, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const item of plan.transfers) {
      insert.run(id, item.fromIdentityKey, item.fromDiscordId || null, item.fromCharacterName || null, item.fromWallet || null,
        item.toIdentityKey, item.toDiscordId || null, item.toCharacterName || null, item.toWallet || null, item.amount);
    }
    const placeholders = settlementIds.map(() => '?').join(',');
    db.prepare(`UPDATE neso_settlements SET status='IN_BATCH', updatedAt=? WHERE id IN (${placeholders})`).run(now, ...settlementIds);
  })();
  return id;
}

function completeTransferBatch(batchId) {
  const now = new Date().toISOString();
  return db.transaction(() => {
    db.prepare(`UPDATE neso_transfer_batches SET status='DONE', completedAt=? WHERE id=? AND status='OPEN'`).run(now, batchId);
    const rows = db.prepare(`SELECT settlementId FROM neso_transfer_batch_settlements WHERE batchId=?`).all(batchId);
    for (const row of rows) db.prepare(`UPDATE neso_settlements SET status='DONE', updatedAt=? WHERE id=?`).run(now, row.settlementId);
    return rows.length;
  })();
}

function getTransferBatch(batchId) {
  const batch = db.prepare(`SELECT * FROM neso_transfer_batches WHERE id=?`).get(batchId);
  if (!batch) return null;
  const settlementIds = db.prepare(`SELECT settlementId FROM neso_transfer_batch_settlements WHERE batchId=?`).all(batchId).map(x => x.settlementId);
  return {
    ...batch,
    transfers: db.prepare(`SELECT * FROM neso_transfers WHERE batchId=? ORDER BY id`).all(batchId),
    settlementIds,
    settlements: settlementIds.map(getSettlement).filter(Boolean)
  };
}

function getBatchBySettlementId(settlementId) {
  const row = db.prepare(`SELECT batchId FROM neso_transfer_batch_settlements WHERE settlementId=? ORDER BY rowid DESC LIMIT 1`).get(settlementId);
  return row ? getTransferBatch(row.batchId) : null;
}

module.exports = { saveSettlement, getSettlement, listSettlements, createTransferBatch, completeTransferBatch, getTransferBatch, getBatchBySettlementId };
