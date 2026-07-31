'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getBinding } = require('../../services/bindingService');
const { getCharacterDetail, getNesoBalance } = require('../../services/msuApi');
const { getCharacters, getDefaultCharacter } = require('./characterUtils');

function parseTokenAmount(rawValue, decimals = 18) {
  if (rawValue == null || rawValue === '') return null;

  const text = String(rawValue).trim();
  if (!text) return null;

  // API 若已回傳小數字串，就直接轉成 18 位最小單位。
  if (/^-?\d+\.\d+$/.test(text)) {
    const negative = text.startsWith('-');
    const unsigned = negative ? text.slice(1) : text;
    const [whole, fraction = ''] = unsigned.split('.');
    const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals);
    const units = BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(padded || '0');
    return negative ? -units : units;
  }

  if (/^-?\d+$/.test(text)) return BigInt(text);
  return null;
}

function formatTokenUnits(units, decimals = 18, maxFractionDigits = 6) {
  if (units == null) return null;

  const negative = units < 0n;
  const value = negative ? -units : units;
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  let fractionText = fraction.toString().padStart(decimals, '0').slice(0, maxFractionDigits);
  fractionText = fractionText.replace(/0+$/, '');

  const wholeText = whole.toLocaleString('en-US');
  return `${negative ? '-' : ''}${wholeText}${fractionText ? `.${fractionText}` : ''}`;
}

function formatNesoBalance(balance) {
  if (!balance) return null;

  const onchain = parseTokenAmount(balance.onchainNeso);
  const offchain = parseTokenAmount(balance.offchainNeso);
  if (onchain == null && offchain == null) return null;

  return formatTokenUnits((onchain || 0n) + (offchain || 0n));
}

function verifyOwner(interaction, ownerId) {
  if (interaction.user.id === ownerId) return true;

  interaction.reply({
    content: '❌ 你不要亂摸別人的玩家中心阿._.。',
    ephemeral: true
  }).catch(() => {});

  return false;
}

function buildHomeComponents(ownerId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`msume_feature|${ownerId}`)
    .setPlaceholder('選擇玩家中心功能')
    .addOptions(
      {
        label: 'ARC 成長',
        description: '查看目前 ARC 與未來成長預估',
        value: 'arc',
        emoji: '🌀'
      },
      {
        label: '抽獎紀錄',
        description: '查詢綁定角色的抽獎歷史',
        value: 'raffle',
        emoji: '🎲'
      },
      {
        label: '我的隊伍',
        description: '建立、查看與管理 Boss PT',
        value: 'party',
        emoji: '👥'
      },
      {
        label: '經驗追蹤',
        description: '查看每日 EXP、圈內與世界排名變化',
        value: 'exp',
        emoji: '📈'
      },
      {
        label: '玩家設置',
        description: '查看角色、啟用狀態、本尊與別名',
        value: 'settings',
        emoji: '⚙️'
      }
    );

  return [new ActionRowBuilder().addComponents(menu)];
}

function buildBackHomeButton(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`msume_home|${ownerId}`)
      .setLabel('返回玩家中心')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function buildHomePayload(userId) {
  const bind = getBinding(userId);

  if (!bind) {
    return {
      content: [
        '## 🔗 歡迎使用 MSUME 玩家中心',
        '你尚未綁定錢包。點擊下方按鈕輸入自己的 MSU 錢包，系統會自動同步角色。',
        '',
        '⚠️ 請只綁定自己的錢包。'
      ].join('\n'),
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`msume_bind_wallet|${userId}`)
          .setLabel('綁定我的錢包')
          .setEmoji('🔗')
          .setStyle(ButtonStyle.Primary)
      )]
    };
  }

  const main = getDefaultCharacter(bind);
  const characters = getCharacters(bind);

  if (!main) {
    return {
      content: '❌ 綁定資料中找不到可用角色，請重新綁定。',
      components: []
    };
  }

  let content;

  try {
    const [character, nesoBalance] = await Promise.all([
      getCharacterDetail(main.assetKey),
      getNesoBalance(main.wallet)
    ]);
    const name = character?.common?.name || main.characterName || '未知角色';
    const level = character?.common?.level || '?';
    const jobName = character?.common?.job?.jobName || '未知職業';
    const arc = character?.wearing?.arcaneSymbols?.totalArcaneForce || 0;
    const cp = character?.apStat?.combatPower;
    const neso = formatNesoBalance(nesoBalance);

    content = [
      `## 🎮 ${name} 的玩家中心`,
      `**Lv.${level}｜${jobName}**`,
      `🌀 ARC：${Number(arc).toLocaleString()}`,
      cp != null ? `⚔️ CP：${Number(cp).toLocaleString()}` : null,
      neso != null ? `💰 NESO：${neso}` : null,
      `🔗 已綁定角色：${characters.length} 位`,
      '',
      '請選擇要使用的功能：'
    ].filter(Boolean).join('\n');
  } catch (error) {
    console.error('MSUME HOME CHARACTER ERROR:', error.response?.data || error.message);

    content = [
      `## 🎮 ${main.characterName || main.alias || '玩家'} 的玩家中心`,
      `🔗 已綁定角色：${characters.length} 位`,
      '',
      '⚠️ 角色即時資料暫時無法更新，但仍可使用下方功能。'
    ].join('\n');
  }

  return {
    content,
    components: buildHomeComponents(userId)
  };
}


module.exports = { verifyOwner, buildHomeComponents, buildBackHomeButton, buildHomePayload };
