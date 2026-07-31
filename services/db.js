const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'msu-bot.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS parties (
  name TEXT PRIMARY KEY,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS party_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partyName TEXT NOT NULL,
  discordId TEXT NOT NULL,
  alias TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,

  FOREIGN KEY (partyName) REFERENCES parties(name) ON DELETE CASCADE,
  UNIQUE(partyName, discordId, alias)
);

CREATE TABLE IF NOT EXISTS party_layers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partyName TEXT NOT NULL,
    layerId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
  
    FOREIGN KEY (partyName) REFERENCES parties(name) ON DELETE CASCADE,
    UNIQUE(partyName, layerId)
  );

CREATE TABLE IF NOT EXISTS raffle_history_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assetKey TEXT NOT NULL,
  wallet TEXT NOT NULL,
  discordId TEXT,
  alias TEXT,
  characterName TEXT,
  raffledAt TEXT NOT NULL,
  rawJson TEXT NOT NULL,
  syncedAt TEXT NOT NULL,

  UNIQUE(assetKey, wallet, raffledAt)
);

CREATE TABLE IF NOT EXISTS settlement_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partyName TEXT NOT NULL,
  settledDate TEXT NOT NULL,
  ownerDiscordId TEXT,
  itemName TEXT NOT NULL,
  itemCount REAL NOT NULL DEFAULT 1,
  price INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,

  FOREIGN KEY (partyName) REFERENCES parties(name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settlement_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recordId INTEGER NOT NULL,
  discordId TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  shareAmount INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (recordId) REFERENCES settlement_records(id) ON DELETE CASCADE,
  UNIQUE(recordId, discordId)
);
CREATE TABLE IF NOT EXISTS settlement_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partyName TEXT NOT NULL,
    settledDate TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    createdBy TEXT,
    lockedBy TEXT,
    doneBy TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    lockedAt TEXT,
    doneAt TEXT,
  
    FOREIGN KEY (partyName) REFERENCES parties(name) ON DELETE CASCADE,
    UNIQUE(partyName, settledDate)
  );
  
  CREATE TABLE IF NOT EXISTS settlement_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER NOT NULL,
    itemName TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    ownerDiscordId TEXT,
    mode TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    remainingQuantity REAL NOT NULL DEFAULT 0,
    createdBy TEXT,
    updatedBy TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
  
    FOREIGN KEY (sessionId) REFERENCES settlement_sessions(id) ON DELETE CASCADE
  );
  
  CREATE TABLE IF NOT EXISTS settlement_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER NOT NULL,
    discordId TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    createdAt TEXT NOT NULL,
  
    FOREIGN KEY (sessionId) REFERENCES settlement_sessions(id) ON DELETE CASCADE
  );
`);



// V5：PT 成員改用 assetKey 當固定識別值；舊欄位保留以相容既有資料。
const partyMemberColumns = db.prepare(`PRAGMA table_info(party_members)`).all();
const partyMemberColumnNames = new Set(partyMemberColumns.map(column => column.name));
if (!partyMemberColumnNames.has('assetKey')) {
  db.exec(`ALTER TABLE party_members ADD COLUMN assetKey TEXT`);
}
if (!partyMemberColumnNames.has('characterName')) {
  db.exec(`ALTER TABLE party_members ADD COLUMN characterName TEXT`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_party_members_asset_key ON party_members(partyName, assetKey)`);

console.log('✅ SQLite ready:', dbPath);



// EXP Tracker v2.4 migration: preserve old columns, add correctly named fields,
// then repair existing snapshots from the stored raw API JSON.
function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some(column => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

ensureColumn('exp_tracker_snapshots', 'currentExp', 'TEXT');
ensureColumn('exp_tracker_snapshots', 'requiredExp', 'TEXT');

try {
  db.prepare(`
    UPDATE exp_tracker_snapshots
    SET currentExp = COALESCE(
          CAST(json_extract(rawJson, '$.common.exp') AS TEXT),
          currentExp,
          levelExp
        ),
        requiredExp = COALESCE(
          CAST(json_extract(rawJson, '$.common.totalExp') AS TEXT),
          requiredExp,
          totalExp
        ),
        expRate = COALESCE(
          CAST(json_extract(rawJson, '$.common.expr') AS REAL),
          expRate
        )
    WHERE rawJson IS NOT NULL
  `).run();
} catch (error) {
  console.warn('[EXP] 舊 Snapshot 自動修復略過：', error.message || error);
}

module.exports = db;
// PT 2.0：保留舊表與 partyName 外鍵，相容 split/layer；新增互動式 PT 所需欄位。
const partyColumnsV2 = new Set(db.prepare(`PRAGMA table_info(parties)`).all().map(c => c.name));
for (const [name, sqlType] of [
  ['partyId', 'TEXT'],
  ['bossId', 'TEXT'],
  ['difficulty', 'TEXT'],
  ['leaderDiscordId', 'TEXT'],
  ['leaderAssetKey', 'TEXT'],
  ['status', "TEXT NOT NULL DEFAULT 'ACTIVE'"]
]) {
  if (!partyColumnsV2.has(name)) db.exec(`ALTER TABLE parties ADD COLUMN ${name} ${sqlType}`);
}
const crypto = require('crypto');
const partiesWithoutId = db.prepare(`SELECT name FROM parties WHERE partyId IS NULL OR partyId = ''`).all();
const setPartyId = db.prepare(`UPDATE parties SET partyId = ? WHERE name = ?`);
for (const party of partiesWithoutId) setPartyId.run(crypto.randomUUID(), party.name);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_parties_party_id ON parties(partyId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_parties_pt2_lookup ON parties(status, bossId, difficulty)`);

// PT 2.1：允許 knownchar（無 Discord）加入，並保存角色來源與 wallet。
const pmInfoV21 = db.prepare(`PRAGMA table_info(party_members)`).all();
const pmColsV21 = new Set(pmInfoV21.map(c => c.name));
const discordColV21 = pmInfoV21.find(c => c.name === 'discordId');
if (discordColV21?.notnull === 1) {
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`
      ALTER TABLE party_members RENAME TO party_members_legacy_v21;
      CREATE TABLE party_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partyName TEXT NOT NULL,
        discordId TEXT,
        alias TEXT NOT NULL,
        assetKey TEXT,
        characterName TEXT,
        wallet TEXT,
        sourceType TEXT NOT NULL DEFAULT 'binding',
        sourceKey TEXT,
        weight REAL NOT NULL DEFAULT 1,
        sortOrder INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (partyName) REFERENCES parties(name) ON DELETE CASCADE,
        UNIQUE(partyName, assetKey)
      );
      INSERT INTO party_members (id, partyName, discordId, alias, assetKey, characterName, weight, sortOrder, createdAt, updatedAt)
      SELECT id, partyName, discordId, alias, assetKey, characterName, weight, sortOrder, createdAt, updatedAt
      FROM party_members_legacy_v21;
      DROP TABLE party_members_legacy_v21;
    `);
  })();
  db.pragma('foreign_keys = ON');
} else {
  if (!pmColsV21.has('wallet')) db.exec(`ALTER TABLE party_members ADD COLUMN wallet TEXT`);
  if (!pmColsV21.has('sourceType')) db.exec(`ALTER TABLE party_members ADD COLUMN sourceType TEXT NOT NULL DEFAULT 'binding'`);
  if (!pmColsV21.has('sourceKey')) db.exec(`ALTER TABLE party_members ADD COLUMN sourceKey TEXT`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_party_members_asset_key_v21 ON party_members(assetKey)`);


// PT 2.0 bugfix：封存隊伍保留歷史，但允許再次使用相同顯示名稱。
const partyColumnsArchive = new Set(db.prepare(`PRAGMA table_info(parties)`).all().map(c => c.name));
if (!partyColumnsArchive.has('displayName')) db.exec(`ALTER TABLE parties ADD COLUMN displayName TEXT`);
if (!partyColumnsArchive.has('archivedAt')) db.exec(`ALTER TABLE parties ADD COLUMN archivedAt TEXT`);
db.prepare(`UPDATE parties SET displayName = name WHERE displayName IS NULL OR displayName = ''`).run();
db.exec(`CREATE INDEX IF NOT EXISTS idx_parties_archive_lookup ON parties(status, archivedAt, updatedAt)`);

// EXP Tracker 1.0：角色以 assetKey 為唯一識別；每日快照與重試狀態寫入 SQLite。
db.exec(`
CREATE TABLE IF NOT EXISTS exp_tracker_characters (
  assetKey TEXT PRIMARY KEY,
  characterName TEXT NOT NULL,
  jobName TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exp_tracker_enabled ON exp_tracker_characters(enabled, characterName);

CREATE TABLE IF NOT EXISTS exp_daily_jobs (
  jobDate TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  totalCount INTEGER NOT NULL DEFAULT 0,
  successCount INTEGER NOT NULL DEFAULT 0,
  pendingCount INTEGER NOT NULL DEFAULT 0,
  startedAt TEXT NOT NULL,
  completedAt TEXT,
  reportMessageId TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exp_daily_job_characters (
  jobDate TEXT NOT NULL,
  assetKey TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attemptCount INTEGER NOT NULL DEFAULT 0,
  lastErrorCode TEXT,
  lastErrorMessage TEXT,
  lastAttemptAt TEXT,
  nextRetryAt TEXT,
  completedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (jobDate, assetKey),
  FOREIGN KEY (assetKey) REFERENCES exp_tracker_characters(assetKey)
);
CREATE INDEX IF NOT EXISTS idx_exp_job_pending ON exp_daily_job_characters(status, nextRetryAt, jobDate);

CREATE TABLE IF NOT EXISTS exp_tracker_snapshots (
  jobDate TEXT NOT NULL,
  assetKey TEXT NOT NULL,
  characterName TEXT NOT NULL,
  jobName TEXT,
  level INTEGER NOT NULL,
  currentExp TEXT,
  requiredExp TEXT,
  expRate REAL,
  totalExp TEXT,
  levelExp TEXT,
  worldRank INTEGER,
  localRank INTEGER,
  localRankChange INTEGER,
  worldRankChange INTEGER,
  gainedExp TEXT,
  capturedAt TEXT NOT NULL,
  rawJson TEXT,
  PRIMARY KEY (jobDate, assetKey),
  FOREIGN KEY (assetKey) REFERENCES exp_tracker_characters(assetKey)
);
CREATE INDEX IF NOT EXISTS idx_exp_snapshots_asset_date ON exp_tracker_snapshots(assetKey, jobDate DESC);

CREATE TABLE IF NOT EXISTS exp_tracker_settings (
  settingKey TEXT PRIMARY KEY,
  settingValue TEXT,
  updatedAt TEXT NOT NULL
);
`);
