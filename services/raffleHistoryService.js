const db = require('./db');
const { getCharacterRaffleHistory } = require('./msuApi');

const activeSyncs = new Map();
const manualSyncCooldowns = new Map();
const MANUAL_SYNC_COOLDOWN_MS = 5 * 60 * 1000;

function buildCacheKey(assetKey, wallet, raffledAt) {
  return `${assetKey}|${wallet.toLowerCase()}|${raffledAt}`;
}

function getCachedHistory(assetKey, wallet, raffledAt) {
  const row = db.prepare(`
    SELECT rawJson, syncedAt
    FROM raffle_history_results
    WHERE assetKey = ?
      AND wallet = ?
      AND raffledAt = ?
  `).get(assetKey, wallet, raffledAt);

  if (!row) return null;

  return {
    result: JSON.parse(row.rawJson),
    syncedAt: row.syncedAt
  };
}

function saveHistory({
  assetKey,
  wallet,
  discordId,
  alias,
  characterName,
  raffledAt,
  result
}) {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO raffle_history_results (
      assetKey,
      wallet,
      discordId,
      alias,
      characterName,
      raffledAt,
      rawJson,
      syncedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(assetKey, wallet, raffledAt) DO UPDATE SET
      discordId = excluded.discordId,
      alias = excluded.alias,
      characterName = excluded.characterName,
      rawJson = excluded.rawJson,
      syncedAt = excluded.syncedAt
  `).run(
    assetKey,
    wallet,
    discordId || null,
    alias || null,
    characterName || null,
    raffledAt,
    JSON.stringify(result),
    now
  );

  return now;
}

async function fetchAndSaveHistory(params) {
  const cacheKey = buildCacheKey(
    params.assetKey,
    params.wallet,
    params.raffledAt
  );

  if (activeSyncs.has(cacheKey)) {
    return activeSyncs.get(cacheKey);
  }

  const task = (async () => {
    const result = await getCharacterRaffleHistory(
      params.assetKey,
      params.wallet,
      params.raffledAt
    );

    const syncedAt = saveHistory({ ...params, result });

    return {
      result,
      source: 'api',
      syncedAt
    };
  })().finally(() => {
    activeSyncs.delete(cacheKey);
  });

  activeSyncs.set(cacheKey, task);
  return task;
}

async function getArchivedRaffleHistory(params, options = {}) {
  const { forceRefresh = false } = options;
  const cached = getCachedHistory(
    params.assetKey,
    params.wallet,
    params.raffledAt
  );

  // 包含空結果也視為有效快取，避免同一天反覆打 API。
  if (cached && !forceRefresh) {
    return {
      result: cached.result,
      source: 'sqlite',
      syncedAt: cached.syncedAt
    };
  }

  return fetchAndSaveHistory(params);
}

function getManualSyncCooldown(userId, assetKey) {
  const key = `${userId}|${assetKey}`;
  const lastSyncedAt = manualSyncCooldowns.get(key);

  if (!lastSyncedAt) return 0;

  return Math.max(
    MANUAL_SYNC_COOLDOWN_MS - (Date.now() - lastSyncedAt),
    0
  );
}

function markManualSync(userId, assetKey) {
  manualSyncCooldowns.set(`${userId}|${assetKey}`, Date.now());
}

module.exports = {
  getCachedHistory,
  saveHistory,
  getArchivedRaffleHistory,
  getManualSyncCooldown,
  markManualSync,
  MANUAL_SYNC_COOLDOWN_MS
};
