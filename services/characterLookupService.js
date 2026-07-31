const axios = require('axios');

const BASE_URL = 'https://openapi.msu.io/v1rc1';

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-nxopen-api-key': process.env.MSU_API_KEY
  };
}

async function searchCharacterByName(name) {
    const url = `${BASE_URL}/search/characters`;
  
    const res = await axios.get(url, {
      headers: getHeaders(),
      params: {
        name,
        keyword: name,
        q: name,
        searchText: name,
        pageNo: 1,
        pageSize: 30
      },
      timeout: 5000
    });
  
    return res.data;
  }

async function findCharacterByWalletAndName(wallet, name) {
  const url = `${BASE_URL}/accounts/${wallet}/characters`;

  const res = await axios.get(url, {
    headers: getHeaders(),
    params: { searchText: name, pageNo: 1, pageSize: 30 },
    timeout: 5000
  });

  const characters = res.data?.data?.characters || [];

  const exact = characters.find(c =>
    String(c.name || c.characterName || '').toLowerCase() === String(name).toLowerCase()
  );

  const character = exact || characters[0];

  if (!character) return null;

  return {
    characterName: character.name || character.characterName || name,
    assetKey: character.assetKey,
    wallet
  };
}

module.exports = {
  searchCharacterByName,
  findCharacterByWalletAndName
};