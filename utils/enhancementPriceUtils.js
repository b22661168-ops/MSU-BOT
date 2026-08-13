'use strict';

const TOKEN_DECIMALS = 18;

const POTENTIAL_ITEM_NAMES = {
  '2711000': '奇幻方塊',
  '2730000': '附加方塊',
  '5062009': '紅色方塊',
  '5062010': '黑色方塊',
  '5062500': '綠色附加方塊',
  '5062503': '白色附加方塊'
};

function tokenUnitsToNumberString(rawValue, decimals = TOKEN_DECIMALS, maxFractionDigits = 2) {
  if (rawValue == null) return '-';
  const text = String(rawValue).trim();
  if (!/^-?\d+$/.test(text)) return text;

  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const value = BigInt(unsigned || '0');
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const remainder = value % scale;

  let fraction = remainder.toString().padStart(decimals, '0').slice(0, maxFractionDigits);
  fraction = fraction.replace(/0+$/, '');

  return `${negative ? '-' : ''}${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
}

function formatNesoPrice(rawValue) {
  return `${tokenUnitsToNumberString(rawValue)} NESO`;
}

function formatPriceChange(currentRaw, previousRaw) {
  try {
    const current = BigInt(String(currentRaw));
    const previous = BigInt(String(previousRaw));
    if (previous === 0n || current === previous) return '—';

    // 百分比保留兩位：以 basis points 計算，避免 Number 精度問題。
    const diff = current - previous;
    const bps = (diff * 10000n) / previous;
    const sign = bps > 0n ? '▲' : '▼';
    const abs = bps < 0n ? -bps : bps;
    const whole = abs / 100n;
    const fraction = (abs % 100n).toString().padStart(2, '0');
    return `${sign} ${whole}.${fraction}%`;
  } catch {
    return '—';
  }
}

function getPotentialItemName(itemId) {
  return POTENTIAL_ITEM_NAMES[String(itemId)] || `物品 ${itemId}`;
}

function formatApiTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

module.exports = {
  TOKEN_DECIMALS,
  POTENTIAL_ITEM_NAMES,
  tokenUnitsToNumberString,
  formatNesoPrice,
  formatPriceChange,
  getPotentialItemName,
  formatApiTime
};
