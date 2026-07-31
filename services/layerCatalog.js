'use strict';

const fs = require('fs');
const path = require('path');

const LAYER_NAMES_FILE = path.join(__dirname, '..', 'data', 'layerNames.json');

function loadLayerNames() {
  try {
    return JSON.parse(fs.readFileSync(LAYER_NAMES_FILE, 'utf8'));
  } catch (error) {
    console.error('[LayerCatalog] 讀取 layerNames.json 失敗：', error.message);
    return {};
  }
}

function getLayerEntries() {
  return Object.entries(loadLayerNames());
}

const BOSS_DEFINITIONS = [
  ['slime', '綠水靈', [/綠水靈/]],
  // Layer 名稱除了完整 Boss 名，也支援常用縮寫，例如「困史普發」。
  ['lotus', '史烏', [/史烏/, /(?:簡|普|困|混|極)史/]],
  ['damien', '戴米安', [/戴米安/, /戴米幣/, /(?:簡|普|困|混|極)戴/]],
  ['lucid', '露希妲', [/露希妲/, /(?:簡|普|困|混|極)露/]],
  ['will', '威爾', [/威爾/i, /will/i, /(?:簡|普|困|混|極)威/]],
  ['gloom', '戴斯克', [/戴斯克/]],
  ['verus_hilla', '真希拉', [/真希拉/]],
  ['darknell', '頓凱爾', [/頓凱爾/, /敦凱爾/]],
  ['black_mage', '黑魔法師', [/黑魔法師/, /黑王/]]
];

const PT_BOSSES = BOSS_DEFINITIONS.map(([id, label]) => [id, label]);
const PT_DIFFICULTIES = [
  ['easy', '簡單'],
  ['normal', '普通'],
  ['hard', '困難'],
  ['chaos', '混沌'],
  ['extreme', '極限'],
  ['mixed', '複合']
];

function getLayerName(layerId) {
  const layerNames = loadLayerNames();
  return String(layerNames[String(layerId)] || `Layer ${layerId}`);
}

function inferBossId(layerId, name = getLayerName(layerId)) {
  const text = String(name || '');
  return BOSS_DEFINITIONS.find(([, , patterns]) => patterns.some(pattern => pattern.test(text)))?.[0] || null;
}

function inferDifficulty(layerId, name = getLayerName(layerId)) {
  const text = String(name || '');
  if (/極限/.test(text)) return 'extreme';
  if (/混沌|混/.test(text)) return 'chaos';
  if (/困難|困/.test(text)) return 'hard';
  if (/簡單|簡/.test(text)) return 'easy';
  if (/普通|普/.test(text)) return 'normal';
  return null;
}

function listLayersForBoss(bossId) {
  return getLayerEntries()
    .map(([layerId, name]) => ({
      layerId: String(layerId),
      name: String(name),
      bossId: inferBossId(layerId, name),
      difficulty: inferDifficulty(layerId, name)
    }))
    .filter(layer => layer.bossId === bossId)
    .sort((a, b) => Number(a.layerId) - Number(b.layerId));
}

function resolvePartyDifficulty(layerIds) {
  const values = [...new Set((layerIds || []).map(id => inferDifficulty(id)).filter(Boolean))];
  if (values.length === 1) return values[0];
  if (values.length > 1) return 'mixed';
  return null;
}

module.exports = {
  loadLayerNames,
  getLayerEntries,
  PT_BOSSES,
  PT_DIFFICULTIES,
  getLayerName,
  inferBossId,
  inferDifficulty,
  listLayersForBoss,
  resolvePartyDifficulty
};
