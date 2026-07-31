const axios = require('axios');

const BINANCE_NXPC_URL =
  'https://api.binance.com/api/v3/ticker/24hr';

const MAX_USDT_TWD_URL =
  'https://max-api.maicoin.com/api/v2/tickers/usdttwd';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * 將資料轉成有限數字。
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {number}
 */
function toFiniteNumber(value, fieldName) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(
      `無法解析 ${fieldName}：${String(value)}`
    );
  }

  return number;
}

/**
 * 取得 Binance NXPC/USDT 行情。
 *
 * @returns {Promise<{
 *   price: number,
 *   changePercent: number
 * }>}
 */
async function fetchNxpcUsdt() {
  const response = await axios.get(
    BINANCE_NXPC_URL,
    {
      params: {
        symbol: 'NXPCUSDT'
      },
      timeout: REQUEST_TIMEOUT_MS
    }
  );

  return {
    price: toFiniteNumber(
      response.data?.lastPrice,
      'Binance lastPrice'
    ),

    changePercent: toFiniteNumber(
      response.data?.priceChangePercent,
      'Binance priceChangePercent'
    )
  };
}

/**
 * 取得 MAX 的 USDT/TWD 最近成交價。
 *
 * @returns {Promise<number>}
 */
async function fetchUsdtTwd() {
  const response = await axios.get(
    MAX_USDT_TWD_URL,
    {
      timeout: REQUEST_TIMEOUT_MS
    }
  );

  const ticker = response.data;

  const candidate =
    ticker?.last ??
    ticker?.close ??
    ticker?.price ??
    ticker?.ticker?.last;

  return toFiniteNumber(
    candidate,
    'MAX USDT/TWD last'
  );
}

/**
 * 產生漲跌圖示與文字。
 *
 * @param {number} changePercent
 * @returns {{ icon: string, text: string }}
 */
function formatChange(changePercent) {
  const icon =
    changePercent >= 0
      ? '🟢'
      : '🔴';

  const sign =
    changePercent >= 0
      ? '+'
      : '';

  return {
    icon,
    text:
      `${sign}${changePercent.toFixed(2)}%`
  };
}

/**
 * 產生美金頻道名稱。
 *
 * 範例：
 * 💵 NXPC $0.2565 🟢+0.18%
 *
 * @param {{
 *   nxpcUsdt: number,
 *   changePercent: number
 * }} data
 * @returns {string}
 */
function buildNxpcUsdChannelName({
  nxpcUsdt,
  changePercent
}) {
  const change =
    formatChange(changePercent);

  return (
    `💵 NXPC $${nxpcUsdt.toFixed(4)} ` +
    `${change.icon}${change.text}`
  );
}

/**
 * 產生台幣頻道名稱。
 *
 * 範例：
 * 💰 NXPC NT$8.26 🟢+0.18%
 *
 * @param {{
 *   nxpcTwd: number,
 *   changePercent: number
 * }} data
 * @returns {string}
 */
function buildNxpcTwdChannelName({
  nxpcTwd,
  changePercent
}) {
  const change =
    formatChange(changePercent);

  return (
    `💰 NXPC NT$${nxpcTwd.toFixed(2)} ` +
    `${change.icon}${change.text}`
  );
}

/**
 * 取得可修改名稱的 Discord 頻道。
 *
 * @param {import('discord.js').Client} client
 * @param {string} channelId
 * @param {string} label
 * @returns {Promise<import('discord.js').GuildChannel>}
 */
async function fetchEditableChannel(
  client,
  channelId,
  label
) {
  const channel =
    await client.channels.fetch(channelId);

  if (
    !channel ||
    typeof channel.setName !== 'function'
  ) {
    throw new Error(
      `找不到可改名的 ${label} 頻道：${channelId}`
    );
  }

  return channel;
}

/**
 * 只在名稱不同時修改頻道。
 *
 * @param {import('discord.js').GuildChannel} channel
 * @param {string} newName
 * @param {string} label
 * @returns {Promise<boolean>}
 */
async function updateChannelName(
  channel,
  newName,
  label
) {
  if (channel.name === newName) {
    console.log(
      `💹 ${label} 頻道價格無變化：${newName}`
    );

    return false;
  }

  await channel.setName(
    newName,
    '自動更新 NXPC 即時價格'
  );

  console.log(
    `💹 ${label} 頻道已更新：${newName}`
  );

  return true;
}

/**
 * 抓取行情並同時更新 USD、TWD 兩個頻道。
 *
 * API 或頻道更新失敗時只記錄錯誤，
 * 不會讓整個 Bot 中止。
 *
 * @param {import('discord.js').Client} client
 * @returns {Promise<object|null>}
 */
async function updateNxpcChannel(client) {
  const usdChannelId =
    process.env.NXPC_USD_CHANNEL_ID;

  const twdChannelId =
    process.env.NXPC_TWD_CHANNEL_ID;

  if (!usdChannelId || !twdChannelId) {
    console.warn(
      '⚠️ NXPC_USD_CHANNEL_ID 或 ' +
      'NXPC_TWD_CHANNEL_ID 尚未設定，' +
      '略過 NXPC 價格更新。'
    );

    return null;
  }

  try {
    const [
      {
        price: nxpcUsdt,
        changePercent
      },
      usdtTwd
    ] = await Promise.all([
      fetchNxpcUsdt(),
      fetchUsdtTwd()
    ]);

    const nxpcTwd =
      nxpcUsdt * usdtTwd;

    const usdChannelName =
      buildNxpcUsdChannelName({
        nxpcUsdt,
        changePercent
      });

    const twdChannelName =
      buildNxpcTwdChannelName({
        nxpcTwd,
        changePercent
      });

    const [
      usdChannel,
      twdChannel
    ] = await Promise.all([
      fetchEditableChannel(
        client,
        usdChannelId,
        'NXPC 美金'
      ),

      fetchEditableChannel(
        client,
        twdChannelId,
        'NXPC 台幣'
      )
    ]);

    const [
      usdUpdated,
      twdUpdated
    ] = await Promise.all([
      updateChannelName(
        usdChannel,
        usdChannelName,
        'NXPC 美金'
      ),

      updateChannelName(
        twdChannel,
        twdChannelName,
        'NXPC 台幣'
      )
    ]);

    return {
      nxpcUsdt,
      usdtTwd,
      nxpcTwd,
      changePercent,
      usdChannelName,
      twdChannelName,
      usdUpdated,
      twdUpdated
    };
  } catch (error) {
    const apiMessage =
      error.response?.data
        ? JSON.stringify(
            error.response.data
          )
        : error.message;

    console.error(
      `❌ NXPC 價格更新失敗：${apiMessage}`
    );

    return null;
  }
}

module.exports = {
  updateNxpcChannel,
  fetchNxpcUsdt,
  fetchUsdtTwd,
  formatChange,
  buildNxpcUsdChannelName,
  buildNxpcTwdChannelName
};