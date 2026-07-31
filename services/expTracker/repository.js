'use strict';
const db = require('../db');

function nowIso() { return new Date().toISOString(); }

function addCharacter({ assetKey, characterName, jobName = null }) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO exp_tracker_characters (assetKey, characterName, jobName, enabled, createdAt, updatedAt)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(assetKey) DO UPDATE SET
      characterName = excluded.characterName,
      jobName = COALESCE(excluded.jobName, exp_tracker_characters.jobName),
      enabled = 1,
      updatedAt = excluded.updatedAt
  `).run(assetKey, characterName, jobName, now, now);
  return getCharacter(assetKey);
}
function getCharacter(assetKey) { return db.prepare(`SELECT * FROM exp_tracker_characters WHERE assetKey = ?`).get(assetKey) || null; }
function removeCharacter(assetKey) { return db.prepare(`UPDATE exp_tracker_characters SET enabled=0, updatedAt=? WHERE assetKey=? AND enabled=1`).run(nowIso(), assetKey).changes > 0; }
function listCharacters(enabledOnly = true) { return db.prepare(`SELECT * FROM exp_tracker_characters ${enabledOnly ? 'WHERE enabled=1' : ''} ORDER BY characterName COLLATE NOCASE`).all(); }
function countCharacters() { return db.prepare(`SELECT COUNT(*) count FROM exp_tracker_characters WHERE enabled=1`).get().count; }

function ensureDailyJob(jobDate) {
  const characters = listCharacters(true);
  const now = nowIso();
  db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO exp_daily_jobs (jobDate,status,totalCount,successCount,pendingCount,startedAt,updatedAt) VALUES (?, 'RUNNING', ?, 0, ?, ?, ?)`).run(jobDate, characters.length, characters.length, now, now);
    const insert = db.prepare(`INSERT OR IGNORE INTO exp_daily_job_characters (jobDate,assetKey,status,attemptCount,createdAt,updatedAt) VALUES (?,?,'PENDING',0,?,?)`);
    for (const character of characters) insert.run(jobDate, character.assetKey, now, now);
  })();
  refreshJobCounts(jobDate);
  return getJob(jobDate);
}
function getJob(jobDate) { return db.prepare(`SELECT * FROM exp_daily_jobs WHERE jobDate=?`).get(jobDate) || null; }
function getPending(jobDate) {
  return db.prepare(`SELECT j.*, c.characterName, c.jobName FROM exp_daily_job_characters j JOIN exp_tracker_characters c ON c.assetKey=j.assetKey WHERE j.jobDate=? AND j.status='PENDING' AND c.enabled=1 ORDER BY j.attemptCount, c.characterName`).all(jobDate);
}
function markAttemptFailure(jobDate, assetKey, error) {
  const now = nowIso();
  const next = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare(`UPDATE exp_daily_job_characters SET status='PENDING', attemptCount=attemptCount+1,lastErrorCode=?,lastErrorMessage=?,lastAttemptAt=?,nextRetryAt=?,updatedAt=? WHERE jobDate=? AND assetKey=?`).run(error.code || 'UNKNOWN', String(error.message || error).slice(0,1000), now, next, now, jobDate, assetKey);
  refreshJobCounts(jobDate);
}
function saveSuccess(jobDate, mapped, rawJson) {
  const now = nowIso();
  db.transaction(() => {
    db.prepare(`INSERT INTO exp_tracker_snapshots (jobDate,assetKey,characterName,jobName,level,currentExp,requiredExp,expRate,worldRank,capturedAt,rawJson) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(jobDate,assetKey) DO UPDATE SET characterName=excluded.characterName,jobName=excluded.jobName,level=excluded.level,currentExp=excluded.currentExp,requiredExp=excluded.requiredExp,expRate=excluded.expRate,worldRank=excluded.worldRank,capturedAt=excluded.capturedAt,rawJson=excluded.rawJson`).run(jobDate,mapped.assetKey,mapped.characterName,mapped.jobName,mapped.level,mapped.currentExp,mapped.requiredExp,mapped.expRate,mapped.worldRank,now,rawJson);
    db.prepare(`UPDATE exp_tracker_characters SET characterName=?,jobName=COALESCE(?,jobName),updatedAt=? WHERE assetKey=?`).run(mapped.characterName,mapped.jobName,now,mapped.assetKey);
    db.prepare(`UPDATE exp_daily_job_characters SET status='SUCCESS',attemptCount=attemptCount+1,lastErrorCode=NULL,lastErrorMessage=NULL,lastAttemptAt=?,nextRetryAt=NULL,completedAt=?,updatedAt=? WHERE jobDate=? AND assetKey=?`).run(now,now,now,jobDate,mapped.assetKey);
  })();
  refreshJobCounts(jobDate);
}
function refreshJobCounts(jobDate) {
  const counts = db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='SUCCESS' THEN 1 ELSE 0 END) success, SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) pending FROM exp_daily_job_characters WHERE jobDate=?`).get(jobDate);
  db.prepare(`UPDATE exp_daily_jobs SET totalCount=?,successCount=?,pendingCount=?,updatedAt=? WHERE jobDate=?`).run(counts.total||0,counts.success||0,counts.pending||0,nowIso(),jobDate);
}
function duePendingJobs(now = nowIso()) { return db.prepare(`SELECT DISTINCT jobDate FROM exp_daily_job_characters WHERE status='PENDING' AND (nextRetryAt IS NULL OR nextRetryAt<=?) ORDER BY jobDate`).all(now).map(r=>r.jobDate); }
function getSnapshots(jobDate) { return db.prepare(`SELECT * FROM exp_tracker_snapshots WHERE jobDate=? ORDER BY level DESC, LENGTH(COALESCE(currentExp,'0')) DESC, COALESCE(currentExp,'0') DESC`).all(jobDate); }
function getPreviousSnapshot(assetKey, beforeDate) { return db.prepare(`SELECT * FROM exp_tracker_snapshots WHERE assetKey=? AND jobDate<? ORDER BY jobDate DESC LIMIT 1`).get(assetKey,beforeDate)||null; }
function finalizeJob(jobDate, reportMessageId = null) { db.prepare(`UPDATE exp_daily_jobs SET status='COMPLETED',completedAt=?,reportMessageId=COALESCE(?,reportMessageId),updatedAt=? WHERE jobDate=?`).run(nowIso(),reportMessageId,nowIso(),jobDate); }
function markReportMessage(jobDate, id) { db.prepare(`UPDATE exp_daily_jobs SET reportMessageId=?,updatedAt=? WHERE jobDate=?`).run(id,nowIso(),jobDate); }
function getLatestSnapshot(assetKey) { return db.prepare(`SELECT * FROM exp_tracker_snapshots WHERE assetKey=? ORDER BY jobDate DESC LIMIT 1`).get(assetKey)||null; }
function getSnapshot(jobDate, assetKey) { return db.prepare(`SELECT * FROM exp_tracker_snapshots WHERE jobDate=? AND assetKey=?`).get(jobDate, assetKey)||null; }
function listSnapshotDates() { return db.prepare(`SELECT DISTINCT jobDate FROM exp_tracker_snapshots ORDER BY jobDate`).all().map(row => row.jobDate); }
function getSnapshotStats() {
  const tracked = countCharacters();
  const snapshots = db.prepare(`SELECT COUNT(*) count FROM exp_tracker_snapshots`).get().count;
  const dates = db.prepare(`SELECT COUNT(DISTINCT jobDate) count FROM exp_tracker_snapshots`).get().count;
  const pending = db.prepare(`SELECT COUNT(*) count FROM exp_daily_job_characters WHERE status='PENDING'`).get().count;
  const latestDate = db.prepare(`SELECT MAX(jobDate) value FROM exp_tracker_snapshots`).get().value || null;
  return { tracked, snapshots, dates, pending, latestDate };
}
function getSnapshotByDiscord(discordId) {
  const rows = db.prepare(`SELECT assetKey, alias, characterName, isDefault FROM json_each((SELECT json_extract(rawJson,'$.characters') FROM bindings_json_cache WHERE discordId=?))`).all(discordId);
  return rows;
}


function getSetting(key) {
  return db.prepare(`SELECT settingValue FROM exp_tracker_settings WHERE settingKey=?`).get(key)?.settingValue || null;
}
function setSetting(key, value) {
  db.prepare(`INSERT INTO exp_tracker_settings (settingKey,settingValue,updatedAt) VALUES (?,?,?) ON CONFLICT(settingKey) DO UPDATE SET settingValue=excluded.settingValue,updatedAt=excluded.updatedAt`).run(key, value == null ? null : String(value), nowIso());
}
function getChannelSettings() {
  return {
    countChannelId: getSetting('countChannelId'),
    reportChannelId: getSetting('reportChannelId'),
    categoryId: getSetting('categoryId')
  };
}
module.exports={addCharacter,getCharacter,removeCharacter,listCharacters,countCharacters,ensureDailyJob,getJob,getPending,markAttemptFailure,saveSuccess,duePendingJobs,getSnapshots,getPreviousSnapshot,finalizeJob,markReportMessage,getLatestSnapshot,getSnapshot,getSnapshotStats,listSnapshotDates,getSetting,setSetting,getChannelSettings};
