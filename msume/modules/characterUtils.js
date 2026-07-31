'use strict';


function getAllCharacters(bind) {
  if (!bind) return [];

  if (Array.isArray(bind.characters) && bind.characters.length > 0) {
    const seen = new Set();
    return bind.characters.filter(character => {
      if (!character?.assetKey || !character?.wallet) return false;
      if (seen.has(character.assetKey)) return false;
      seen.add(character.assetKey);
      return true;
    });
  }

  if (bind.assetKey && bind.wallet) {
    return [{
      alias: '本尊',
      characterName: bind.characterName,
      assetKey: bind.assetKey,
      wallet: bind.wallet,
      isDefault: true,
      isEnabled: true
    }];
  }

  return [];
}

function getCharacters(bind) {
  return getAllCharacters(bind).filter(character => character.isEnabled !== false);
}

function getDefaultCharacter(bind) {
  const characters = getCharacters(bind);
  return characters.find(character => character.isDefault) || characters[0] || null;
}

function findCharacterByAlias(bind, alias) {
  const characters = getCharacters(bind);
  if (!alias) return getDefaultCharacter(bind);

  return characters.find(character =>
    character.alias?.toLowerCase() === alias.toLowerCase()
  ) || null;
}

function findCharacterByAssetKey(bind, assetKey) {
  return getCharacters(bind).find(character => character.assetKey === assetKey) || null;
}


module.exports = { getAllCharacters, getCharacters, getDefaultCharacter, findCharacterByAlias, findCharacterByAssetKey };
