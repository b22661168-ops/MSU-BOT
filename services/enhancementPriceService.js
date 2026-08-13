'use strict';

const { getEnhancementDynamicPrice } = require('./msuApi');
const { getEnhancementPool } = require('../configs/enhancementPools');

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

function normalizeDynamicPriceResponse(response) {
  const currentPrices = response?.data?.currentPrices;
  if (!currentPrices || typeof currentPrices !== 'object') {
    throw new Error('ENHANCEMENT_PRICE_BAD_RESPONSE');
  }

  return {
    starforce: currentPrices.starforce || {},
    potential: currentPrices.potential || {},
    traceId: response?.traceId || null
  };
}

async function getEnhancementPriceByPool(categoryKey, level, options = {}) {
  const pool = getEnhancementPool(categoryKey, level);
  if (!pool) {
    const error = new Error('ENHANCEMENT_POOL_NOT_CONFIGURED');
    error.code = 'ENHANCEMENT_POOL_NOT_CONFIGURED';
    throw error;
  }

  const cacheKey = `${categoryKey}:${level}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (!options.force && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return { ...cached, source: 'cache', stale: false };
  }

  try {
    const response = await getEnhancementDynamicPrice(pool.itemId);
    const normalized = normalizeDynamicPriceResponse(response);
    const result = {
      categoryKey,
      level: Number(level),
      pool,
      ...normalized,
      fetchedAt: now
    };
    cache.set(cacheKey, result);
    return { ...result, source: 'api', stale: false };
  } catch (error) {
    // API 額度、維護或暫時性錯誤時，若有舊資料就先回退舊快取。
    if (cached) {
      return {
        ...cached,
        source: 'stale-cache',
        stale: true,
        apiError: error
      };
    }
    throw error;
  }
}

function clearEnhancementPriceCache(categoryKey, level) {
  if (categoryKey == null) {
    cache.clear();
    return;
  }
  cache.delete(`${categoryKey}:${level}`);
}

module.exports = {
  CACHE_TTL_MS,
  getEnhancementPriceByPool,
  clearEnhancementPriceCache
};
