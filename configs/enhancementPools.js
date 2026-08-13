'use strict';

const fs = require('fs');
const path = require('path');

const POOL_FILE = path.join(__dirname, '..', 'data', 'enhancementPools.json');
const ITEM_NAMES_FILE = path.join(__dirname, '..', 'data', 'itemNames.json');

const CATEGORY_DEFS = [
  { key: 'weapon', label: '武器', emoji: '⚔️' },
  { key: 'secondary', label: '副武器', emoji: '🗡️' },
  { key: 'energy', label: '能源', emoji: '🔋' },
  { key: 'hat', label: '帽子', emoji: '🪖' },
  { key: 'top', label: '上衣', emoji: '👕' },
  { key: 'overall', label: '套服', emoji: '🥋' },
  { key: 'bottom', label: '褲裙', emoji: '👖' },
  { key: 'glove', label: '手套', emoji: '🧤' },
  { key: 'shoes', label: '鞋子', emoji: '👟' },
  { key: 'cape', label: '披風', emoji: '🧣' },
  { key: 'shoulder', label: '肩膀', emoji: '🎗️' },
  { key: 'ring', label: '戒指', emoji: '💍' },
  { key: 'pendant', label: '項鍊', emoji: '📿' },
  { key: 'belt', label: '腰帶', emoji: '🪢' },
  { key: 'eye', label: '眼飾', emoji: '👓' },
  { key: 'face', label: '臉飾', emoji: '🎭' },
  { key: 'earring', label: '耳環', emoji: '💎' }
];

const CATEGORY_ALIASES = {
  '武器': 'weapon', '武': 'weapon', weapon: 'weapon',
  '副武器': 'secondary', '副武': 'secondary', '副': 'secondary', secondary: 'secondary', subweapon: 'secondary',
  '能源': 'energy', '能': 'energy', energy: 'energy',
  '帽子': 'hat', '帽': 'hat', hat: 'hat',
  '上衣': 'top', '上': 'top', top: 'top',
  '套服': 'overall', '套': 'overall', overall: 'overall',
  '褲裙': 'bottom', '褲子': 'bottom', '褲': 'bottom', bottom: 'bottom',
  '手套': 'glove', '手': 'glove', glove: 'glove',
  '鞋子': 'shoes', '鞋': 'shoes', shoes: 'shoes',
  '披風': 'cape', '披': 'cape', cape: 'cape',
  '肩膀': 'shoulder', '肩': 'shoulder', shoulder: 'shoulder',
  '戒指': 'ring', '戒': 'ring', ring: 'ring',
  '項鍊': 'pendant', '項鏈': 'pendant', '項': 'pendant', pendant: 'pendant', necklace: 'pendant',
  '腰帶': 'belt', '腰': 'belt', belt: 'belt',
  '眼飾': 'eye', '眼飾品': 'eye', '眼': 'eye', eye: 'eye',
  '臉飾': 'face', '臉飾品': 'face', '臉': 'face', face: 'face',
  '耳環': 'earring', '耳': 'earring', earring: 'earring'
};

function ensurePoolFile() {
  fs.mkdirSync(path.dirname(POOL_FILE), { recursive: true });
  if (!fs.existsSync(POOL_FILE)) fs.writeFileSync(POOL_FILE, '{}\n', 'utf8');
}

function loadPoolData() {
  ensurePoolFile();
  try { return JSON.parse(fs.readFileSync(POOL_FILE, 'utf8')) || {}; }
  catch { return {}; }
}

function savePoolData(data) {
  ensurePoolFile();
  fs.writeFileSync(POOL_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function loadItemNames() {
  try { return JSON.parse(fs.readFileSync(ITEM_NAMES_FILE, 'utf8')) || {}; }
  catch { return {}; }
}

function resolveCategoryKey(input) {
  if (!input) return null;
  return CATEGORY_ALIASES[String(input).trim().toLowerCase()] || CATEGORY_ALIASES[String(input).trim()] || null;
}

function getLevels(categoryKey) {
  const data = loadPoolData();
  const itemNames = loadItemNames();
  const rows = data[categoryKey] || {};
  return Object.entries(rows)
    .map(([level, row]) => ({
      level: Number(level),
      itemId: Number(row.itemId),
      itemName: itemNames[String(row.itemId)] || row.itemName || null,
      updatedAt: row.updatedAt || null
    }))
    .filter(row => Number.isFinite(row.level) && Number.isFinite(row.itemId))
    .sort((a, b) => a.level - b.level);
}

// levels 使用 getter：每次 MSUME 開啟時都重新讀 JSON，所以 >EP 後不用重啟 Bot。
const ENHANCEMENT_CATEGORIES = CATEGORY_DEFS.map(def => {
  const category = { ...def };
  Object.defineProperty(category, 'levels', {
    enumerable: true,
    get() { return getLevels(def.key); }
  });
  return category;
});

function getEnhancementCategory(categoryKey) {
  return ENHANCEMENT_CATEGORIES.find(category => category.key === categoryKey) || null;
}

function getEnhancementPool(categoryKey, level) {
  const category = getEnhancementCategory(categoryKey);
  if (!category) return null;
  return category.levels.find(pool => Number(pool.level) === Number(level)) || null;
}

function setEnhancementPool(categoryInput, level, itemId) {
  const categoryKey = resolveCategoryKey(categoryInput);
  if (!categoryKey) return null;
  const data = loadPoolData();
  if (!data[categoryKey]) data[categoryKey] = {};
  const previous = data[categoryKey][String(level)] || null;
  data[categoryKey][String(level)] = {
    itemId: Number(itemId),
    updatedAt: new Date().toISOString()
  };
  savePoolData(data);
  return { categoryKey, previous, current: data[categoryKey][String(level)] };
}

function deleteEnhancementPool(categoryInput, level) {
  const categoryKey = resolveCategoryKey(categoryInput);
  if (!categoryKey) return null;
  const data = loadPoolData();
  const previous = data[categoryKey]?.[String(level)] || null;
  if (!previous) return { categoryKey, deleted: false };
  delete data[categoryKey][String(level)];
  if (Object.keys(data[categoryKey]).length === 0) delete data[categoryKey];
  savePoolData(data);
  return { categoryKey, deleted: true, previous };
}

module.exports = {
  ENHANCEMENT_CATEGORIES,
  CATEGORY_DEFS,
  resolveCategoryKey,
  getEnhancementCategory,
  getEnhancementPool,
  setEnhancementPool,
  deleteEnhancementPool,
  loadPoolData
};
