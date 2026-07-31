'use strict';

function getPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function firstValue(object, paths) {
  for (const path of paths) {
    const value = getPath(object, path);
    if (value !== undefined && value !== null && value !== '') return { path, value };
  }
  return { path: null, value: null };
}

function toInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function toBigIntString(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).replace(/[,_\s]/g, '');
  if (!/^-?\d+$/.test(normalized)) return null;
  try { return BigInt(normalized).toString(); } catch { return null; }
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/[,%\s]/g, ''));
  return Number.isFinite(number) ? number : null;
}

const FIELD_PATHS = {
  assetKey: ['assetKey', 'asset_key', 'common.assetKey', 'common.asset_key'],
  name: ['common.name', 'name', 'characterName', 'character_name'],
  level: ['common.level', 'level', 'characterLevel', 'character_level'],
  jobName: ['common.job.jobName', 'common.job.name', 'job.jobName', 'jobName', 'job_name'],

  // MSU 角色 API 的正確定義：
  // common.exp      = 目前等級已累積 EXP
  // common.totalExp = 本等級升級所需 EXP
  // common.expr     = 目前 EXP 百分比
  currentExp: [
    'common.exp', 'common.currentExp', 'common.currentExperience',
    'currentExp', 'currentExperience', 'current_exp', 'levelExp', 'level_exp'
  ],
  requiredExp: [
    'common.totalExp', 'common.requiredExp', 'common.requiredExperience',
    'requiredExp', 'requiredExperience', 'required_exp', 'totalExp', 'totalExperience'
  ],
  expRate: [
    'common.expr', 'common.expRate', 'common.experienceRate', 'common.expPercent',
    'common.expPercentage', 'expRate', 'experienceRate', 'expPercent',
    'expPercentage', 'exp_rate', 'exp_percentage'
  ],
  worldRank: [
    'ranking.worldRank', 'ranking.world.rank', 'rank.world', 'common.worldRank',
    'worldRank', 'worldRanking', 'world_rank', 'rank'
  ]
};

function mapCharacterProgress(character, expectedAssetKey = null) {
  const raw = character || {};
  const found = Object.fromEntries(
    Object.entries(FIELD_PATHS).map(([key, paths]) => [key, firstValue(raw, paths)])
  );

  const mapped = {
    assetKey: String(found.assetKey.value || expectedAssetKey || '').trim() || null,
    characterName: found.name.value == null ? null : String(found.name.value),
    level: toInteger(found.level.value),
    jobName: found.jobName.value == null ? null : String(found.jobName.value),
    currentExp: toBigIntString(found.currentExp.value),
    requiredExp: toBigIntString(found.requiredExp.value),
    expRate: toNumber(found.expRate.value),
    worldRank: toInteger(found.worldRank.value),
    fieldPaths: Object.fromEntries(Object.entries(found).map(([key, item]) => [key, item.path]))
  };

  const errors = [];
  if (!mapped.assetKey) errors.push('缺少 assetKey');
  if (!mapped.characterName) errors.push('缺少角色名稱');
  if (mapped.level === null) errors.push('缺少等級');
  if (mapped.currentExp === null) errors.push('缺少目前 EXP（common.exp）');
  if (mapped.requiredExp === null) errors.push('缺少升級需求 EXP（common.totalExp）');

  return { valid: errors.length === 0, errors, ...mapped };
}

module.exports = { FIELD_PATHS, mapCharacterProgress };
