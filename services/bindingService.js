const fs = require('fs');
const path = require('path');

const BINDINGS_FILE = path.join(__dirname, '..', 'data', 'bindings.json');

function loadBindings() {
  if (!fs.existsSync(BINDINGS_FILE)) return {};
  return JSON.parse(fs.readFileSync(BINDINGS_FILE, 'utf8'));
}

function saveBindings(bindings) {
  fs.writeFileSync(BINDINGS_FILE, JSON.stringify(bindings, null, 2), 'utf8');
}

function normalizeBinding(binding) {
  if (!binding) return null;

  if (!Array.isArray(binding.wallets)) {
    binding.wallets = binding.wallet ? [binding.wallet] : [];
  }

  if (!Array.isArray(binding.characters)) {
    binding.characters = [];
    if (binding.assetKey && binding.wallet) {
      binding.characters.push({
        alias: '本尊',
        characterName: binding.characterName,
        assetKey: binding.assetKey,
        wallet: binding.wallet,
        isDefault: true,
        isEnabled: true,
        updatedAt: binding.updatedAt || new Date().toISOString()
      });
    }
  }

  const seen = new Set();
  binding.characters = binding.characters
    .filter(character => character?.assetKey && character?.wallet)
    .map(character => ({
      ...character,
      isEnabled: character.isEnabled !== false,
      isDefault: Boolean(character.isDefault)
    }))
    .filter(character => {
      if (seen.has(character.assetKey)) return false;
      seen.add(character.assetKey);
      return true;
    });

  if (binding.characters.length > 0 && !binding.characters.some(c => c.isDefault)) {
    binding.characters[0].isDefault = true;
  }

  return binding;
}

function getBinding(userId) {
  const bindings = loadBindings();
  return normalizeBinding(bindings[userId]);
}

function setBinding(userId, data) {
  const bindings = loadBindings();
  bindings[userId] = normalizeBinding({
    ...data,
    updatedAt: new Date().toISOString()
  });
  saveBindings(bindings);
  return bindings[userId];
}

function updateBinding(userId, updater) {
  const bindings = loadBindings();
  const binding = normalizeBinding(bindings[userId]);
  if (!binding) return null;

  const updated = normalizeBinding(updater(binding) || binding);
  updated.updatedAt = new Date().toISOString();
  bindings[userId] = updated;
  saveBindings(bindings);
  return updated;
}

function removeBinding(userId) {
  const bindings = loadBindings();
  if (!bindings[userId]) return false;
  delete bindings[userId];
  saveBindings(bindings);
  return true;
}

function findCharacter(binding, input) {
  const text = String(input || '').trim().toLowerCase();
  if (!binding || !text) return null;
  return binding.characters.find(character =>
    character.assetKey?.toLowerCase() === text ||
    character.characterName?.toLowerCase() === text ||
    character.alias?.toLowerCase() === text
  ) || null;
}

function removeCharacter(userId, input) {
  let removed = null;
  const updated = updateBinding(userId, binding => {
    const target = findCharacter(binding, input);
    if (!target) return binding;
    removed = { ...target };
    binding.characters = binding.characters.filter(c => c.assetKey !== target.assetKey);
    if (target.isDefault && binding.characters.length > 0) {
      binding.characters[0].isDefault = true;
    }
    return binding;
  });
  return { updated, removed };
}

function setCharacterEnabled(userId, assetKey, enabled) {
  return updateBinding(userId, binding => {
    const target = binding.characters.find(c => c.assetKey === assetKey);
    if (!target) return binding;
    target.isEnabled = Boolean(enabled);
    if (!target.isEnabled && target.isDefault) {
      target.isDefault = false;
      const replacement = binding.characters.find(c => c.isEnabled && c.assetKey !== assetKey);
      if (replacement) replacement.isDefault = true;
    }
    return binding;
  });
}

function setDefaultCharacter(userId, assetKey) {
  return updateBinding(userId, binding => {
    const target = binding.characters.find(c => c.assetKey === assetKey);
    if (!target) return binding;
    target.isEnabled = true;
    binding.characters.forEach(c => { c.isDefault = c.assetKey === assetKey; });
    return binding;
  });
}

function renameCharacterAlias(userId, assetKey, alias) {
  const cleanAlias = String(alias || '').trim();
  if (!cleanAlias) return null;
  return updateBinding(userId, binding => {
    const target = binding.characters.find(c => c.assetKey === assetKey);
    if (target) target.alias = cleanAlias;
    return binding;
  });
}

module.exports = {
  loadBindings,
  saveBindings,
  normalizeBinding,
  getBinding,
  setBinding,
  updateBinding,
  removeBinding,
  findCharacter,
  removeCharacter,
  setCharacterEnabled,
  setDefaultCharacter,
  renameCharacterAlias
};
