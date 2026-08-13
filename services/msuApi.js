const axios = require('axios');

const API_BASE_URL = 'https://openapi.msu.io/v1rc1';

function getHeaders() {
  return {
    'x-nxopen-api-key': process.env.MSU_API_KEY
  };
}

async function getNesoBalance(walletAddress) {
  const url = `${API_BASE_URL}/accounts/${walletAddress}/neso`;

  const response = await axios.get(url, {
    headers: getHeaders(),
    timeout: 10000
  });

  return response.data?.data || null;
}

async function getCharactersByWallet(wallet) {
  const url = `${API_BASE_URL}/accounts/${wallet}/characters`;
  const allCharacters = [];
  const seenAssetKeys = new Set();
  const seenCursors = new Set();
  let cursor = null;

  // MSU 角色清單採 cursor 分頁。持續抓取，避免角色超過單頁上限時只拿到前 50 隻。
  for (let page = 0; page < 100; page += 1) {
    const params = { size: 100 };
    if (cursor) params.cursor = cursor;

    const response = await axios.get(url, {
      headers: getHeaders(),
      params,
      timeout: 15000
    });

    const data = response.data?.data || {};
    const characters = Array.isArray(data.characters) ? data.characters : [];

    for (const character of characters) {
      if (!character?.assetKey || seenAssetKeys.has(character.assetKey)) continue;
      seenAssetKeys.add(character.assetKey);
      allCharacters.push(character);
    }

    const nextCursor = data.nextCursor || data.next_cursor || data.cursor?.next || null;
    const hasMore = data.hasMore ?? data.has_more ?? Boolean(nextCursor);

    if (!hasMore || !nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return allCharacters;
}

async function getCharacterDetail(assetKey) {
  const url = `${API_BASE_URL}/characters/${assetKey}`;

  const response = await axios.get(url, {
    headers: getHeaders(),
    timeout: 10000
  });

  return response.data?.data?.character;
}

async function getCharacterRaffleHistory(assetKey, walletAddress, raffledAt) {
  const formattedRaffledAt = raffledAt.includes('T')
    ? raffledAt
    : `${raffledAt}T00:00:00Z`;

  const url =
    `${API_BASE_URL}/msn/characters/${assetKey}/raffles/history` +
    `?walletAddress=${encodeURIComponent(walletAddress)}` +
    `&raffledAt=${encodeURIComponent(formattedRaffledAt)}`;

  const response = await axios.get(url, {
    headers: getHeaders(),
    timeout: 10000
  });

  return response.data;
}

async function getCharacterRaffleInfo(assetKey, walletAddress) {
  const url =
    `${API_BASE_URL}/msn/characters/${assetKey}/raffles` +
    `?walletAddress=${encodeURIComponent(walletAddress)}`;

  const response = await axios.get(url, {
    headers: getHeaders(),
    timeout: 10000
  });

  return response.data;
}

async function getItemMetadata(itemId) {
  const url = `${API_BASE_URL}/gamemeta/items/${itemId}`;

  const response = await axios.get(url, {
    headers: getHeaders(),
    timeout: 10000
  });

  return response.data?.data?.item;
}

async function getEnhancementDynamicPrice(itemId) {
  const url = `${API_BASE_URL}/enhancement/items/${itemId}/dynamicprice`;

  const response = await axios.get(url, {
    headers: {
      ...getHeaders(),
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });

  return response.data;
}

module.exports = {
  getNesoBalance,
  getCharactersByWallet,
  getCharacterDetail,
  getCharacterRaffleHistory,
  getCharacterRaffleInfo,
  getItemMetadata,
  getEnhancementDynamicPrice
};