const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', '..', 'data', 'msu-bot.db');
const db = new Database(dbPath);

function initFarmTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nono_farm_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farm_key TEXT NOT NULL UNIQUE,
      nickname TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS nono_farm_daily_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_date TEXT NOT NULL,
      farm_key TEXT NOT NULL,
      owner_name TEXT,
      type TEXT NOT NULL,
      rarity TEXT,
      item_name TEXT NOT NULL,
      price INTEGER,
      warehouse_count INTEGER,
      warehouse_text TEXT,
      personal_limit TEXT,
      global_limit TEXT,
      raw_text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS nono_farm_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_date TEXT NOT NULL,
      farm_key TEXT NOT NULL,
      field_no INTEGER,
      crop_name TEXT,
      status TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getTodayString() {
  const now = new Date();
  const taiwan = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));

  const yyyy = taiwan.getFullYear();
  const mm = String(taiwan.getMonth() + 1).padStart(2, '0');
  const dd = String(taiwan.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

function clearDailyFarmData(scanDate = getTodayString()) {
  const transaction = db.transaction(() => {
    db.prepare(`DELETE FROM nono_farm_daily_records WHERE scan_date = ?`).run(scanDate);
    db.prepare(`DELETE FROM nono_farm_fields WHERE scan_date = ?`).run(scanDate);
  });

  transaction();
}

function saveFarmResult({ scanDate = getTodayString(), farmKey, parsed }) {
  if (!farmKey) throw new Error('saveFarmResult 缺少 farmKey');
  if (!parsed) throw new Error('saveFarmResult 缺少 parsed');

  const insertRecord = db.prepare(`
    INSERT INTO nono_farm_daily_records
    (
      scan_date,
      farm_key,
      owner_name,
      type,
      rarity,
      item_name,
      price,
      warehouse_count,
      warehouse_text,
      personal_limit,
      global_limit,
      raw_text
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertField = db.prepare(`
    INSERT INTO nono_farm_fields
    (
      scan_date,
      farm_key,
      field_no,
      crop_name,
      status
    )
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const seed of parsed.seeds ?? []) {
      insertRecord.run(
        scanDate,
        farmKey,
        parsed.ownerName,
        'seed',
        seed.rarity,
        seed.itemName,
        seed.price,
        seed.warehouseCount,
        seed.warehouseText,
        seed.personalLimit,
        seed.globalLimit,
        parsed.rawText
      );
    }

    for (const product of parsed.products ?? []) {
      insertRecord.run(
        scanDate,
        farmKey,
        parsed.ownerName,
        'product',
        product.rarity,
        product.itemName,
        product.price,
        product.warehouseCount,
        product.warehouseText,
        product.personalLimit,
        product.globalLimit,
        parsed.rawText
      );
    }

    for (const field of parsed.fields ?? []) {
      insertField.run(
        scanDate,
        farmKey,
        field.fieldNo,
        field.cropName,
        field.status
      );
    }
  });

  transaction();
}

function addFarmTarget(farmKey, nickname = null) {
  return db.prepare(`
    INSERT INTO nono_farm_targets (farm_key, nickname)
    VALUES (?, ?)
    ON CONFLICT(farm_key) DO UPDATE SET
      nickname = excluded.nickname,
      enabled = 1
  `).run(farmKey, nickname);
}

function listFarmTargets() {
  return db.prepare(`
    SELECT farm_key, nickname, enabled
    FROM nono_farm_targets
    ORDER BY farm_key
  `).all();
}

function getTodayRecords(scanDate = getTodayString()) {
  return db.prepare(`
    SELECT *
    FROM nono_farm_daily_records
    WHERE scan_date = ?
    ORDER BY type, rarity, price DESC
  `).all(scanDate);
}

module.exports = {
  initFarmTables,
  getTodayString,
  clearDailyFarmData,
  saveFarmResult,
  addFarmTarget,
  listFarmTargets,
  getTodayRecords
};