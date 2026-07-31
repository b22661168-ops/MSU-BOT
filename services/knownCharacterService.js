const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/knownCharacters.json');

function ensureFile() {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{}', 'utf8');
  }
}

function loadKnownCharacters() {
  ensureFile();
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveKnownCharacters(data) {
  ensureFile();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeKey(key) {
  return String(key || '').trim().toLowerCase();
}

function getKnownCharacter(key) {
  return loadKnownCharacters()[normalizeKey(key)] || null;
}

function findKnownCharacterCandidates(input) {
  const text = normalizeKey(input);
  if (!text) return [];

  return Object.values(loadKnownCharacters())
    .map(character => {
      const key = normalizeKey(character.key);
      const name = normalizeKey(character.characterName);
      const assetKey = normalizeKey(character.assetKey);
      const exact = key === text || name === text || assetKey === text;
      const partial = key.includes(text) || name.includes(text);
      return { ...character, exact, partial, source: 'knownchar' };
    })
    .filter(character => character.exact || character.partial)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || String(a.characterName).localeCompare(String(b.characterName)));
}

function addKnownCharacter(key, character) {
  const data = loadKnownCharacters();
  const normalized = normalizeKey(key);
  data[normalized] = {
    key: normalized,
    characterName: character.characterName,
    assetKey: character.assetKey,
    wallet: character.wallet,
    updatedAt: new Date().toISOString()
  };
  saveKnownCharacters(data);
  return data[normalized];
}

function removeKnownCharacter(key) {
  const data = loadKnownCharacters();
  const normalized = normalizeKey(key);
  if (!data[normalized]) return false;
  delete data[normalized];
  saveKnownCharacters(data);
  return true;
}

function getKnownCharacterByAssetKey(assetKey) {
  const target = String(assetKey || '').trim();
  return Object.values(loadKnownCharacters()).find(character => character.assetKey === target) || null;
}

module.exports = {
  loadKnownCharacters,
  getKnownCharacter,
  findKnownCharacterCandidates,
  addKnownCharacter,
  removeKnownCharacter,
  getKnownCharacterByAssetKey
};
