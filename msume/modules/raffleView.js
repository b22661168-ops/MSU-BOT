'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const itemNames = require('../../data/itemNames.json');
const layerNames = require('../../data/layerNames.json');
const rewardValues = require('../../data/rewardValues.json');
const { getBinding } = require('../../services/bindingService');
const { getArchivedRaffleHistory } = require('../../services/raffleHistoryService');
const { getPartyById, listUserParties } = require('../../services/partyService');
const { getAllCharacters, getCharacters, findCharacterByAssetKey } = require('./characterUtils');
const { buildBackHomeButton } = require('./homeView');
const { PT_BOSSES, PT_DIFFICULTIES, ptLabel, getPartyLayerIds } = require('./partyView');
function buildRaffleCenterPayload(ownerId) {
  const parties = listUserParties(ownerId, ownerId === process.env.OWNER_ID);
  return {
    content: [
      '## 🎲 抽獎中心',
      '請選擇要查詢個人角色，或依 PT 統計指定 Layer 的隊伍抽獎。',
      '',
      `👤 個人抽獎：依你的已啟用角色查詢`,
      `👥 隊伍抽獎：目前可查看 ${parties.length} 個 PT`
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`msume_raffle_personal|${ownerId}`).setLabel('個人抽獎').setEmoji('👤').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`msume_raffle_party|${ownerId}`).setLabel('隊伍抽獎').setEmoji('👥').setStyle(ButtonStyle.Success).setDisabled(parties.length === 0),
        new ButtonBuilder().setCustomId(`msume_settle_home|${ownerId}`).setLabel('NESO 分帳').setEmoji('💰').setStyle(ButtonStyle.Secondary)
      ),
      buildBackHomeButton(ownerId)
    ]
  };
}

function buildPartyRaffleSelectPayload(ownerId) {
  const parties = listUserParties(ownerId, ownerId === process.env.OWNER_ID);
  if (!parties.length) return { content: '❌ 目前沒有可查詢的 PT。', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_home_raffle|${ownerId}`).setLabel('返回抽獎中心').setStyle(ButtonStyle.Secondary))] };
  return {
    content: ['## 👥 隊伍抽獎', '選擇 PT 後輸入開獎日期。', '只會統計該 PT 已設定的 Layer。'].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_raffle_party_select|${ownerId}`).setPlaceholder('選擇 PT').addOptions(parties.slice(0, 25).map(p => ({ label: String(p.name).slice(0,100), description: `${ptLabel(PT_DIFFICULTIES,p.difficulty)}${ptLabel(PT_BOSSES,p.bossId)}｜${p.memberCount || 0} 人`.slice(0,100), value: p.partyId })))),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_home_raffle|${ownerId}`).setLabel('返回抽獎中心').setEmoji('🎲').setStyle(ButtonStyle.Secondary))
    ]
  };
}

function buildRaffleCharacterPayload(ownerId, bind) {
  const characters = getCharacters(bind);

  if (characters.length === 0) {
    return {
      content: '❌ 沒有可查詢的綁定角色。',
      components: [buildBackHomeButton(ownerId)]
    };
  }

  const options = [
    {
      label: '全部角色摘要',
      description: `整合 ${characters.length} 位綁定角色的抽獎結果`,
      value: '__all_summary__',
      emoji: '📊'
    },
    ...characters.slice(0, 24).map(character => ({
      label: (character.alias || character.characterName || '未命名角色').slice(0, 100),
      description: (character.characterName || '未知角色').slice(0, 100),
      value: character.assetKey,
      emoji: character.isDefault ? '⭐' : '🎟️'
    }))
  ];

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`msume_raffle_character|${ownerId}`)
    .setPlaceholder('選擇要查詢的角色')
    .addOptions(options);

  return {
    content: [
      '## 🎲 我的抽獎紀錄',
      `目前共綁定 **${characters.length}** 位角色。`,
      '',
      '可選擇單一角色，或直接查看全部綁定角色的合併摘要。',
      '選擇後再輸入開獎日期；查詢一律優先讀取資料庫，只有缺少該角色日期的資料時才呼叫 API。'
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(menu),
      buildBackHomeButton(ownerId)
    ]
  };
}

function normalizeDate(input) {
  const match = String(input || '').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getItemName(itemId) {
  return itemNames[String(itemId)] || `未知物品(${itemId})`;
}

function getLayerName(layerId) {
  return layerNames[String(layerId)] || `Layer ${layerId}`;
}

function getRewardDisplayName(itemId, rotationId, layerId) {
  let name = getItemName(itemId);

  if (itemId === 1) {
    const layerReward = rewardValues[String(layerId)] || {};
    if (rotationId === 54 && layerReward.big) name = layerReward.big;
    else if (rotationId === 37 && layerReward.normal) name = layerReward.normal;
    else if ((!rotationId || rotationId === 0) && layerReward.small) name = layerReward.small;
  }

  return name;
}

function isWinState(state) {
  return state === 'RAFFLE_STATE_CLAIMED' || state === 'RAFFLE_STATE_PENDING_CLAIM';
}

function isLoseState(state) {
  return state === 'RAFFLE_STATE_PARTICIPATE_FAIL' || state === 'RAFFLE_STATE_LOSE';
}

function getStateText(state) {
  if (state === 'RAFFLE_STATE_PENDING_CLAIM') return '🎉 中獎待領';
  if (state === 'RAFFLE_STATE_CLAIMED') return '✅ 已領獎';
  if (isLoseState(state)) return '❌ 未中';
  return state || '未知狀態';
}

function summarizePrizePool(prizes = [], layerId) {
  const map = new Map();

  for (const prize of prizes || []) {
    const itemId = prize.rewardKey?.itemId;
    const rotationId = prize.rewardKey?.rotationId || 0;
    const count = Number(prize.tokenCount || 0);
    const name = getRewardDisplayName(itemId, rotationId, layerId);
    map.set(name, (map.get(name) || 0) + count);
  }

  return [...map.entries()].map(([name, count]) => `${name} ×${count}`);
}

function summarizeReceivedRewards(prizes = [], layerId, state) {
  const map = new Map();

  for (const prize of prizes || []) {
    const receivedCount = Number(prize.receivedCount?.value || 0);
    const winCount = Number(prize.winCount?.value || 0);
    const count = state === 'RAFFLE_STATE_PENDING_CLAIM' ? winCount : receivedCount;
    if (count <= 0) continue;

    const itemId = prize.rewardKey?.itemId;
    const rotationId = prize.rewardKey?.rotationId || 0;
    const name = itemId === 1
      ? 'NESO'
      : getRewardDisplayName(itemId, rotationId, layerId);

    map.set(name, (map.get(name) || 0) + count);
  }

  return [...map.entries()].map(([name, count]) =>
    name === 'NESO'
      ? `${Math.floor(count).toLocaleString()} NESO`
      : `${name} ×${count}`
  );
}

function buildRafflePages(histories, pageSize = 5) {
  const pages = [];
  const totalPages = Math.max(1, Math.ceil(histories.length / pageSize));

  for (let i = 0; i < histories.length; i += pageSize) {
    const pageItems = histories.slice(i, i + pageSize);
    const pageNumber = Math.floor(i / pageSize) + 1;

    const lines = pageItems.map((history, localIndex) => {
      const index = i + localIndex + 1;
      const poolLines = summarizePrizePool(history.prizes, history.layerId);
      const receivedLines = summarizeReceivedRewards(history.prizes, history.layerId, history.state);

      return [
        `${index}. ${getLayerName(history.layerId)}`,
        `狀態：${getStateText(history.state)}`,
        `抽獎資格：${poolLines.length ? poolLines.join('、') : '無'}`,
        `中獎明細：${receivedLines.length ? receivedLines.join('、') : '無'}`
      ].join('\n');
    });

    pages.push([
      `第 ${pageNumber}/${totalPages} 頁`,
      '',
      '```',
      lines.join('\n\n'),
      '```'
    ].join('\n'));
  }

  return pages.length ? pages : ['這一天查無抽獎紀錄。'];
}

function buildRaffleHeader(character, raffledAt, histories, source, syncedAt) {
  const wins = histories.filter(history => isWinState(history.state));
  const fails = histories.filter(history => isLoseState(history.state));
  const aliasText = character.alias ? `（${character.alias}）` : '';
  const sourceText = source === 'sqlite' ? '本地資料庫' : 'MSU API（已寫入資料庫）';

  return [
    `🎟️ ${character.characterName || '未知角色'}${aliasText} 抽獎歷史`,
    `日期：${raffledAt}`,
    `資料來源：${sourceText}`,
    syncedAt
      ? `最後同步：${new Date(syncedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`
      : null,
    '',
    `✅ 中獎：${wins.length}`,
    `❌ 未中：${fails.length}`,
    `📦 總獎池：${histories.length}`,
    ''
  ].filter(Boolean).join('\n');
}

function buildRaffleResultButtons(ownerId, assetKey, raffledAt, currentPage, totalPages) {
  const rows = [];

  if (totalPages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`msume_raffle_page|${ownerId}|${assetKey}|${raffledAt}|${currentPage - 1}`)
        .setLabel('上一頁')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 0),
      new ButtonBuilder()
        .setCustomId(`msume_raffle_page|${ownerId}|${assetKey}|${raffledAt}|${currentPage + 1}`)
        .setLabel('下一頁')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage >= totalPages - 1)
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`msume_raffle_sync|${ownerId}|${assetKey}|${raffledAt}`)
      .setLabel('重新同步 API')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`msume_home_raffle|${ownerId}`)
      .setLabel('切換角色')
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`msume_home|${ownerId}`)
      .setLabel('返回首頁')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary)
  ));

  return rows;
}

function buildRaffleResultPayload(character, raffledAt, result, source, syncedAt, page = 0) {
  const histories = result?.data?.histories || [];
  const pages = buildRafflePages(histories, 5);
  const safePage = Math.max(0, Math.min(Number(page) || 0, pages.length - 1));
  const header = buildRaffleHeader(character, raffledAt, histories, source, syncedAt);

  return {
    content: `${header}${pages[safePage]}`,
    components: buildRaffleResultButtons(
      character.__ownerId,
      character.assetKey,
      raffledAt,
      safePage,
      pages.length
    )
  };
}


function getFinalRewardCount(prize, state) {
  const receivedCount = Number(prize.receivedCount?.value || 0);
  const winCount = Number(prize.winCount?.value || 0);
  return state === 'RAFFLE_STATE_PENDING_CLAIM' ? winCount : receivedCount;
}

function collectRaffleRewards(histories = []) {
  const rewards = new Map();
  let neso = 0;

  for (const history of histories) {
    if (!isWinState(history.state)) continue;

    for (const prize of history.prizes || []) {
      const count = getFinalRewardCount(prize, history.state);
      if (count <= 0) continue;

      const itemId = prize.rewardKey?.itemId;
      const rotationId = prize.rewardKey?.rotationId || 0;

      if (itemId === 1) {
        neso += Math.floor(count);
        continue;
      }

      const name = getRewardDisplayName(itemId, rotationId, history.layerId);
      rewards.set(name, (rewards.get(name) || 0) + count);
    }
  }

  return { neso, rewards };
}

function formatCompactRewards(histories = [], limit = 6) {
  const { neso, rewards } = collectRaffleRewards(histories);
  const entries = [...rewards.entries()].sort((a, b) => b[1] - a[1]);
  const parts = [];

  if (neso > 0) parts.push(`${neso.toLocaleString()} NESO`);
  for (const [name, count] of entries.slice(0, limit)) {
    parts.push(`${name} ×${count}`);
  }

  if (entries.length > limit) parts.push(`…另 ${entries.length - limit} 種`);
  return parts.length ? parts.join('、') : '無';
}

function splitSummarySections(sections, maxLength = 1750) {
  const pages = [];
  let current = '';

  for (const section of sections) {
    const candidate = current ? `${current}\n\n${section}` : section;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) pages.push(current);

    if (section.length <= maxLength) {
      current = section;
      continue;
    }

    const lines = section.split('\n');
    current = '';
    for (const line of lines) {
      const next = current ? `${current}\n${line}` : line;
      if (next.length > maxLength && current) {
        pages.push(current);
        current = line;
      } else {
        current = next;
      }
    }
  }

  if (current) pages.push(current);
  return pages.length ? pages : ['查無摘要資料。'];
}

function buildAllRaffleSummaryPages(ownerId, raffledAt, characterResults) {
  const successful = characterResults.filter(item => !item.error);
  const allHistories = successful.flatMap(item => item.histories);
  const totalWins = allHistories.filter(history => isWinState(history.state)).length;
  const totalPending = allHistories.filter(history => history.state === 'RAFFLE_STATE_PENDING_CLAIM').length;
  const totalLoses = allHistories.filter(history => isLoseState(history.state)).length;
  const sqliteCount = successful.filter(item => item.source === 'sqlite').length;
  const apiCount = successful.filter(item => item.source === 'api').length;
  const { neso, rewards } = collectRaffleRewards(allHistories);
  const rewardLines = [...rewards.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `• ${name} ×${count}`);

  const overview = [
    '## 📊 綁定角色抽獎摘要',
    `📅 日期：${raffledAt}`,
    `👤 查詢角色：${characterResults.length} 位｜成功 ${successful.length} 位`,
    `💾 資料來源：本地資料庫 ${sqliteCount} 位｜透過 API 查詢（已寫入本地）${apiCount} 位`,
    '',
    `📦 總獎池：${allHistories.length}`,
    `✅ 中獎：${totalWins}`,
    `🎁 待領：${totalPending}`,
    `❌ 未中：${totalLoses}`,
    '',
    '**合併中獎內容**',
    neso > 0 ? `• ${neso.toLocaleString()} NESO` : null,
    ...rewardLines,
    rewardLines.length === 0 && neso === 0 ? '• 無' : null
  ].filter(Boolean).join('\n');

  const characterSections = characterResults.map((item, index) => {
    const character = item.character;
    const label = character.alias || character.characterName || `角色 ${index + 1}`;
    const nameSuffix = character.characterName && character.characterName !== label
      ? `｜${character.characterName}`
      : '';

    if (item.error) {
      return [
        `**${index + 1}. ${label}${nameSuffix}**`,
        `⚠️ 查詢失敗：${item.error}`
      ].join('\n');
    }

    const wins = item.histories.filter(history => isWinState(history.state)).length;
    const pending = item.histories.filter(history => history.state === 'RAFFLE_STATE_PENDING_CLAIM').length;
    const sourceText = item.source === 'sqlite'
      ? '資料來源：本地資料庫'
      : '資料來源：透過 API 查詢（已寫入本地）';

    return [
      `**${index + 1}. ${label}${nameSuffix}**`,
      `📦 ${item.histories.length} 池｜✅ ${wins} 中｜🎁 ${pending} 待領`,
      `💾 ${sourceText}`,
      `　${formatCompactRewards(item.histories)}`
    ].join('\n');
  });

  return splitSummarySections([overview, '**各角色摘要**', ...characterSections]);
}

function buildAllRaffleSummaryComponents(ownerId, raffledAt, currentPage, totalPages) {
  const rows = [];

  if (totalPages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`msume_raffle_all_page|${ownerId}|${raffledAt}|${currentPage - 1}`)
        .setLabel('上一頁')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 0),
      new ButtonBuilder()
        .setCustomId(`msume_raffle_all_page|${ownerId}|${raffledAt}|${currentPage + 1}`)
        .setLabel('下一頁')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage >= totalPages - 1)
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`msume_raffle_all_date|${ownerId}`)
      .setLabel('更換日期')
      .setEmoji('📅')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`msume_home_raffle|${ownerId}`)
      .setLabel('返回抽獎選單')
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`msume_home|${ownerId}`)
      .setLabel('返回首頁')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary)
  ));

  return rows;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function queryAllRaffleSummary(ownerId, raffledAt, page = 0) {
  const bind = getBinding(ownerId);
  if (!bind) throw new Error('BINDING_NOT_FOUND');

  const characters = getCharacters(bind);
  const characterResults = [];

  // 刻意循序查詢，避免多隻角色同時缺快取時瞬間灌爆 MSU API。
  for (const character of characters) {
    try {
      const { result, source, syncedAt } = await getArchivedRaffleHistory({
        assetKey: character.assetKey,
        wallet: character.wallet,
        discordId: ownerId,
        alias: character.alias,
        characterName: character.characterName,
        raffledAt
      });

      characterResults.push({
        character,
        histories: result?.data?.histories || [],
        source,
        syncedAt
      });
    } catch (error) {
      const apiMessage = error.response?.data?.error?.message || error.message || '未知錯誤';
      characterResults.push({
        character,
        histories: [],
        error: apiMessage.includes('failed to get character raffle history')
          ? '這天沒有抽獎紀錄'
          : 'API 暫時無法查詢（未寫入本地資料庫）'
      });
    }

    // 多角色摘要會逐隻查詢；保留短暫間隔，降低 API 瞬間請求壓力。
    if (character !== characters[characters.length - 1]) {
      await sleep(500);
    }
  }

  const pages = buildAllRaffleSummaryPages(ownerId, raffledAt, characterResults);
  const safePage = Math.max(0, Math.min(Number(page) || 0, pages.length - 1));

  return {
    content: `${pages[safePage]}\n\n第 ${safePage + 1}/${pages.length} 頁`,
    components: buildAllRaffleSummaryComponents(
      ownerId,
      raffledAt,
      safePage,
      pages.length
    )
  };
}

function showPartyRaffleDateModal(interaction, ownerId, partyId) {
  const party = getPartyById(partyId);
  if (!party) return interaction.reply({content:'❌ 找不到 PT。',ephemeral:true});
  const layers = getPartyLayerIds(party);
  if (!layers.length) return interaction.reply({content:'❌ 這個 PT 尚未設定分寶 Layer，請先到隊伍頁設定。',ephemeral:true});
  const modal = new ModalBuilder().setCustomId(`msume_raffle_party_date_modal|${ownerId}|${partyId}`).setTitle(`${party.name} 隊伍抽獎`);
  modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('raffledAt').setLabel('請輸入開獎日期 YYYY-MM-DD').setPlaceholder('例如：2026-07-10').setStyle(TextInputStyle.Short).setRequired(true)));
  return interaction.showModal(modal);
}

function buildPartyRaffleSummaryPages(party, raffledAt, characterResults, layerIds) {
  const filtered = characterResults.map(item => ({...item, histories: (item.histories || []).filter(h => layerIds.includes(String(h.layerId)))}));
  const successful = filtered.filter(item => !item.error);
  const allHistories = successful.flatMap(item => item.histories);
  const { neso, rewards } = collectRaffleRewards(allHistories);
  const rewardLines = [...rewards.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>`• ${name} ×${count}`);
  const overview = [
    `## 👥 ${party.name}｜隊伍抽獎摘要`, `📅 日期：${raffledAt}`,
    `🎯 Layer：${layerIds.map(id=>getLayerName(id)).join('、')}`,
    `👤 成員：${party.members.length} 位｜成功 ${successful.length} 位`, '',
    `📦 總獎池：${allHistories.length}`,
    `✅ 中獎：${allHistories.filter(h=>isWinState(h.state)).length}`,
    `🎁 待領：${allHistories.filter(h=>h.state==='RAFFLE_STATE_PENDING_CLAIM').length}`,
    `❌ 未中：${allHistories.filter(h=>isLoseState(h.state)).length}`, '', '**合併中獎內容**',
    neso > 0 ? `• ${neso.toLocaleString()} NESO` : null, ...rewardLines,
    rewardLines.length === 0 && neso === 0 ? '• 無' : null
  ].filter(Boolean).join('\n');
  const sections = filtered.map((item,index)=>{
    const c=item.character, label=c.alias||c.characterName||`角色 ${index+1}`;
    if(item.error) return `**${index+1}. ${label}**\n⚠️ ${item.error}`;
    return `**${index+1}. ${label}${c.characterName && c.characterName!==label ? `｜${c.characterName}`:''}**\n📦 ${item.histories.length} 池｜✅ ${item.histories.filter(h=>isWinState(h.state)).length} 中｜🎁 ${item.histories.filter(h=>h.state==='RAFFLE_STATE_PENDING_CLAIM').length} 待領\n　${formatCompactRewards(item.histories)}`;
  });
  return splitSummarySections([overview, '**各成員摘要**', ...sections]);
}

async function queryPartyRaffleSummary(ownerId, partyId, raffledAt, page = 0) {
  const party = getPartyById(partyId);
  if (!party) throw new Error('PARTY_NOT_FOUND');
  const layerIds = getPartyLayerIds(party);
  if (!layerIds.length) throw new Error('PARTY_LAYERS_EMPTY');
  const results=[];
  for (const member of party.members) {
    const bind=member.discordId ? getBinding(member.discordId) : null;
    const character=getAllCharacters(bind).find(c=>c.assetKey===member.assetKey) || (member.wallet ? member : null);
    if(!character){ results.push({character:member,histories:[],error:'找不到角色 wallet 或綁定資料'}); continue; }
    try {
      const {result,source,syncedAt}=await getArchivedRaffleHistory({assetKey:character.assetKey,wallet:character.wallet,discordId:member.discordId,alias:character.alias,characterName:character.characterName,raffledAt});
      results.push({character,histories:result?.data?.histories||[],source,syncedAt});
    } catch(error) {
      const msg=error.response?.data?.error?.message||error.message||'未知錯誤';
      results.push({character,histories:[],error:msg.includes('failed to get character raffle history')?'這天沒有抽獎紀錄':'API 暫時無法查詢'});
    }
    if(member !== party.members[party.members.length-1]) await sleep(500);
  }
  const pages=buildPartyRaffleSummaryPages(party,raffledAt,results,layerIds);
  const safe=Math.max(0,Math.min(Number(page)||0,pages.length-1));
  const rows=[];
  if(pages.length>1) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`msume_raffle_party_page|${ownerId}|${partyId}|${raffledAt}|${safe-1}`).setLabel('上一頁').setStyle(ButtonStyle.Secondary).setDisabled(safe<=0),
    new ButtonBuilder().setCustomId(`msume_raffle_party_page|${ownerId}|${partyId}|${raffledAt}|${safe+1}`).setLabel('下一頁').setStyle(ButtonStyle.Primary).setDisabled(safe>=pages.length-1)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`msume_pt_raffle|${ownerId}|${partyId}`).setLabel('更換日期').setEmoji('📅').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`msume_raffle_party|${ownerId}`).setLabel('返回隊伍抽獎').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`msume_home_raffle|${ownerId}`).setLabel('抽獎中心').setStyle(ButtonStyle.Secondary)
  ));
  return {content:`${pages[safe]}\n\n第 ${safe+1}/${pages.length} 頁`,components:rows};
}

function showAllRaffleDateModal(interaction, ownerId) {
  const modal = new ModalBuilder()
    .setCustomId(`msume_raffle_all_date_modal|${ownerId}`)
    .setTitle('全部綁定角色抽獎摘要');

  const input = new TextInputBuilder()
    .setCustomId('raffledAt')
    .setLabel('請輸入開獎日期 YYYY-MM-DD')
    .setPlaceholder('例如：2026-07-10')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

async function queryRaffleHistory(ownerId, assetKey, raffledAt, forceRefresh = false) {
  const bind = getBinding(ownerId);
  if (!bind) throw new Error('BINDING_NOT_FOUND');

  const character = findCharacterByAssetKey(bind, assetKey);
  if (!character) throw new Error('CHARACTER_NOT_FOUND');

  const query = {
    assetKey: character.assetKey,
    wallet: character.wallet,
    discordId: ownerId,
    alias: character.alias,
    characterName: character.characterName,
    raffledAt
  };

  const { result, source, syncedAt } = await getArchivedRaffleHistory(
    query,
    { forceRefresh }
  );

  return buildRaffleResultPayload(
    { ...character, __ownerId: ownerId },
    raffledAt,
    result,
    source,
    syncedAt,
    0
  );
}


module.exports = { buildRaffleCenterPayload, buildPartyRaffleSelectPayload, buildRaffleCharacterPayload, normalizeDate, getItemName, getLayerName, getRewardDisplayName, isWinState, isLoseState, getStateText, summarizePrizePool, summarizeReceivedRewards, buildRafflePages, buildRaffleHeader, buildRaffleResultButtons, buildRaffleResultPayload, getFinalRewardCount, collectRaffleRewards, formatCompactRewards, splitSummarySections, buildAllRaffleSummaryPages, buildAllRaffleSummaryComponents, sleep, queryAllRaffleSummary, showPartyRaffleDateModal, buildPartyRaffleSummaryPages, queryPartyRaffleSummary, showAllRaffleDateModal, queryRaffleHistory };
