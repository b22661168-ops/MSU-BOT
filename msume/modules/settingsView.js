'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getBinding, setBinding, updateBinding } = require('../../services/bindingService');
const { getCharactersByWallet, getCharacterDetail } = require('../../services/msuApi');
const { getAllCharacters } = require('./characterUtils');
const { buildBackHomeButton } = require('./homeView');
const walletSyncCooldowns = new Map();
const WALLET_SYNC_COOLDOWN_MS = 30 * 60 * 1000;
function buildSettingsPayload(ownerId, page = 0, selectedAssetKey = null) {
  const bind = getBinding(ownerId);
  if (!bind) {
    return {
      content: '❌ 你還沒有綁定資料。',
      components: [buildBackHomeButton(ownerId)]
    };
  }

  const characters = [...getAllCharacters(bind)].sort((a, b) => {
    const levelDiff = (Number(b.level) || 0) - (Number(a.level) || 0);
    if (levelDiff !== 0) return levelDiff;
    return String(a.characterName || a.alias || '').localeCompare(
      String(b.characterName || b.alias || ''),
      'zh-Hant'
    );
  });
  const enabledCount = characters.filter(character => character.isEnabled !== false).length;
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(characters.length / pageSize));
  const safePage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  const startIndex = safePage * pageSize;
  const pageCharacters = characters.slice(startIndex, startIndex + pageSize);

  const lines = pageCharacters.map((character, index) => {
    const flags = [
      character.isDefault ? '⭐ 本尊' : null,
      character.isEnabled === false ? '⏸️ 未啟用' : '✅ 已啟用'
    ].filter(Boolean).join('｜');

    return [
      `${startIndex + index + 1}. **${character.alias || '未命名'}｜${character.characterName || '未知角色'}**`,
      `　Lv.${Number(character.level) || '?'}｜${flags}`,
      `　\`${character.assetKey}\``
    ].join('\n');
  });

  const components = [];

  if (pageCharacters.length > 0) {
    const menu = new StringSelectMenuBuilder()
    .setCustomId(`msume_settings_character|${ownerId}|${safePage}`)
      .setPlaceholder(`選擇要管理的角色（第 ${safePage + 1}/${totalPages} 頁）`)
      .addOptions(pageCharacters.map(character => ({
        label: `${character.alias || '未命名'}｜${character.characterName || '未知角色'}`.slice(0, 100),
        description: `Lv.${Number(character.level) || '?'}｜${character.isDefault ? '本尊｜' : ''}${character.isEnabled === false ? '未啟用' : '已啟用'}`.slice(0, 100),
        value: character.assetKey,
        emoji: character.isDefault ? '⭐' : (character.isEnabled === false ? '⏸️' : '🎭'),
        default: character.assetKey === selectedAssetKey
      })));

    components.push(new ActionRowBuilder().addComponents(menu));
  }

  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`msume_settings_page|${ownerId}|${safePage - 1}`)
        .setLabel('上一頁')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`msume_settings_page|${ownerId}|${safePage + 1}`)
        .setLabel('下一頁')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1)
    ));
  }

  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`msume_settings_sync|${ownerId}|${safePage}`)
      .setLabel('同步錢包角色')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`msume_home|${ownerId}`)
      .setLabel('返回玩家中心')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary)
  ));

  return {
    content: [
      '## ⚙️ 玩家設置',
      `已啟用角色：${enabledCount}/${characters.length}`,
      `頁數：${safePage + 1}/${totalPages}`,
      '',
      lines.join('\n\n') || '目前沒有角色。',
      '',
      '角色功能內部皆以 `assetKey` 識別；修改別名不會影響 PT。'
    ].join('\n'),
    components
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryDelayMs(error, attempt) {
  const retryAfterHeader = error?.response?.headers?.['retry-after'];
  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds * 1000) + 250;
  }

  const retryAfterBody = Number(
    error?.response?.data?.retry_after ??
    error?.response?.data?.retryAfter
  );
  if (Number.isFinite(retryAfterBody) && retryAfterBody > 0) {
    return Math.ceil(retryAfterBody * 1000) + 250;
  }

  return 1500 * attempt;
}

async function getCharacterDetailSlowly(assetKey, maxAttempts = 4) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await getCharacterDetail(assetKey);
    } catch (error) {
      lastError = error;
      const status = Number(error?.response?.status) || 0;
      const canRetry = status === 429 || status >= 500 || !status;

      if (!canRetry || attempt >= maxAttempts) break;
      await sleep(getRetryDelayMs(error, attempt));
    }
  }

  throw lastError || new Error('CHARACTER_DETAIL_FAILED');
}

function readCharacterLevel(detail) {
  const candidates = [
    detail?.common?.level,
    detail?.level,
    detail?.characterLevel,
    detail?.character_level
  ];

  for (const value of candidates) {
    const level = Number(value);
    if (Number.isInteger(level) && level > 0) return level;
  }
  return null;
}

async function syncWalletCharacters(ownerId, force = false) {
  const bind = getBinding(ownerId);
  if (!bind) throw new Error('BINDING_NOT_FOUND');

  const lastSync = walletSyncCooldowns.get(ownerId) || 0;
  const remain = WALLET_SYNC_COOLDOWN_MS - (Date.now() - lastSync);
  if (!force && remain > 0) {
    return { cooldownMs: remain, added: 0, updated: 0, levelSuccess: 0, levelFailed: 0 };
  }

  const wallets = [...new Set([
    ...(Array.isArray(bind.wallets) ? bind.wallets : []),
    ...getAllCharacters(bind).map(character => character.wallet)
  ].filter(Boolean))];

  const characterMap = new Map();
  for (const wallet of wallets) {
    const characters = await getCharactersByWallet(wallet);
    for (const character of characters) {
      if (!character?.assetKey) continue;
      characterMap.set(character.assetKey, {
        assetKey: character.assetKey,
        characterName: character.name || character.characterName || '未知角色',
        wallet
      });
    }
  }

  const apiCharacters = [...characterMap.values()];

  // 清單 API 不含等級，因此逐隻查詳細資料。
  // 採單線循序查詢，每隻之間保留延遲；遇到 429/伺服器錯誤會自動退避重試。
  // 目標是一次同步盡量查完整批角色，而不是為了速度同時轟 API。
  const detailResults = [];
  const DETAIL_REQUEST_DELAY_MS = 800;

  for (let index = 0; index < apiCharacters.length; index += 1) {
    const character = apiCharacters[index];

    try {
      const detail = await getCharacterDetailSlowly(character.assetKey);
      detailResults.push({
        level: readCharacterLevel(detail),
        characterName: detail?.common?.characterName || detail?.common?.name || detail?.name || null
      });
    } catch (error) {
      console.warn(
        `[MSUME][WalletSync] 角色詳細資料查詢失敗：${character.assetKey}`,
        error?.response?.status || error?.message || error
      );
      detailResults.push({ error });
    }

    if (index < apiCharacters.length - 1) {
      await sleep(DETAIL_REQUEST_DELAY_MS);
    }
  }

  let added = 0;
  let updated = 0;
  let levelSuccess = 0;
  let levelFailed = 0;

  apiCharacters.forEach((character, index) => {
    const result = detailResults[index];
    if (result && !result.error && result.level) {
      character.level = result.level;
      if (result.characterName) character.characterName = result.characterName;
      levelSuccess += 1;
    } else {
      levelFailed += 1;
    }
  });

  updateBinding(ownerId, current => {
    for (const apiCharacter of apiCharacters) {
      const existing = current.characters.find(c => c.assetKey === apiCharacter.assetKey);
      if (existing) {
        existing.characterName = apiCharacter.characterName;
        existing.wallet = apiCharacter.wallet;
        // 查詢失敗時保留舊等級，不把有效資料覆蓋成空值。
        if (apiCharacter.level) existing.level = apiCharacter.level;
        existing.updatedAt = new Date().toISOString();
        updated += 1;
      } else {
        current.characters.push({
          alias: apiCharacter.characterName,
          characterName: apiCharacter.characterName,
          assetKey: apiCharacter.assetKey,
          wallet: apiCharacter.wallet,
          level: apiCharacter.level || null,
          isDefault: current.characters.length === 0,
          isEnabled: false,
          updatedAt: new Date().toISOString()
        });
        added += 1;
      }
    }
    current.wallets = wallets;
    return current;
  });

  walletSyncCooldowns.set(ownerId, Date.now());
  return { cooldownMs: 0, added, updated, levelSuccess, levelFailed };
}

function buildCharacterSettingsPayload(ownerId, assetKey, page = 0) {
  const bind = getBinding(ownerId);
  const character = getAllCharacters(bind).find(c => c.assetKey === assetKey);
  if (!character) return { content: '❌ 找不到角色。', components: [buildBackHomeButton(ownerId)] };

  return {
    content: [
      '## 🎭 角色設置',
      `別名：**${character.alias || '未命名'}**`,
      `角色：**${character.characterName || '未知角色'}**`,
      `等級：**Lv.${Number(character.level) || '?'}**`,
      `狀態：${character.isEnabled === false ? '⏸️ 未啟用' : '✅ 已啟用'}`,
      `本尊：${character.isDefault ? '⭐ 是' : '否'}`,
      `assetKey：\`${character.assetKey}\``
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`msume_settings_toggle|${ownerId}|${assetKey}|${page}`)
          .setLabel(character.isEnabled === false ? '啟用角色' : '停用角色')
          .setEmoji(character.isEnabled === false ? '✅' : '⏸️')
          .setStyle(character.isEnabled === false ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`msume_settings_default|${ownerId}|${assetKey}|${page}`)
          .setLabel('設為本尊')
          .setEmoji('⭐')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(Boolean(character.isDefault)),
        new ButtonBuilder()
          .setCustomId(`msume_settings_rename|${ownerId}|${assetKey}|${page}`)
          .setLabel('修改別名')
          .setEmoji('✏️')
          .setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`msume_settings_page|${ownerId}|${page}`)
          .setLabel('返回玩家設置')
          .setEmoji('⚙️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`msume_home|${ownerId}`)
          .setLabel('返回首頁')
          .setEmoji('🏠')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}



async function bindSelfWallet(ownerId, wallet) {
  const cleanWallet = String(wallet || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(cleanWallet)) throw new Error('WALLET_FORMAT');
  const characters = await getCharactersByWallet(cleanWallet);
  if (!characters.length) throw new Error('WALLET_NO_CHARACTERS');
  setBinding(ownerId, { discordName: ownerId, wallets: [cleanWallet], characters: [], updatedAt: new Date().toISOString() });
  const result = await syncWalletCharacters(ownerId, true);
  return { ...result, total: characters.length };
}

module.exports = { buildSettingsPayload, syncWalletCharacters, buildCharacterSettingsPayload, bindSelfWallet };
