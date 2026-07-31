'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getBinding, loadBindings } = require('../../services/bindingService');
const { getPartyById, listUserParties, canManageParty, listPartyLayers } = require('../../services/partyService');
const { loadKnownCharacters } = require('../../services/knownCharacterService');
const { getCharacters } = require('./characterUtils');
const { buildBackHomeButton } = require('./homeView');
const { PT_BOSSES, PT_DIFFICULTIES, getLayerName, getLayerEntries, listLayersForBoss } = require('../../services/layerCatalog');

function ptLabel(list, id) { return list.find(x => x[0] === id)?.[1] || id || '未設定'; }
function partyErrorMessage(error) {
  const code = String(error?.message || error);
  if (code.startsWith('DUPLICATE_PT:')) return `❌ 此角色已加入相同 Boss、相同難度的隊伍：**${code.split(':').slice(1).join(':')}**。`;
  return ({ PARTY_NAME_EXISTS:'❌ 隊伍名稱已存在。', PARTY_NAME_REQUIRED:'❌ 隊伍名稱不能為空。', MEMBER_NOT_FOUND:'❌ 找不到隊伍成員。', KNOWNCHAR_CANNOT_LEAD:'❌ knownchar 沒有 Discord 身分，不能成為隊長。', KNOWNCHAR_INVALID:'❌ knownchar 資料不完整。', LAYER_BOSS_MISMATCH:'❌ 這個 Layer 不屬於所選 Boss。', PARTY_NOT_FOUND:'❌ 找不到隊伍。', ALREADY_MEMBER:'❌ 這個角色已在本隊。', CANNOT_REMOVE_LEADER:'❌ 不能直接移除隊長。', LEADER_CANNOT_LEAVE:'❌ 隊長不能直接離開，請先轉讓隊長或解散隊伍。' })[code] || '❌ PT 操作失敗。';
}
function buildPartyHomePayload(ownerId) {
  const parties = listUserParties(ownerId, ownerId === process.env.OWNER_ID);
  const selectableParties = parties.filter(p => p?.partyId && String(p.partyId).trim());
  const rows = [];
  if (selectableParties.length) {
    const menu = new StringSelectMenuBuilder().setCustomId(`msume_pt_view|${ownerId}`).setPlaceholder('選擇要查看的隊伍')
      .addOptions(selectableParties.slice(0,25).map(p => ({
        label: String(p.name || '未命名隊伍').slice(0,100),
        description: `${ptLabel(PT_DIFFICULTIES,p.difficulty)}${ptLabel(PT_BOSSES,p.bossId)}｜${p.memberCount || 0} 人`.slice(0,100),
        value: String(p.partyId)
      })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`msume_pt_create|${ownerId}`).setLabel('建立隊伍').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`msume_home|${ownerId}`).setLabel('返回玩家中心').setEmoji('🏠').setStyle(ButtonStyle.Secondary)
  ));
  return { content:['## 👥 我的隊伍', selectableParties.length ? `目前可查看 ${selectableParties.length} 個有效隊伍。` : '你目前沒有加入任何隊伍。', ownerId === process.env.OWNER_ID ? '🛡️ OWNER 模式：可查看與管理所有 PT。' : ''].filter(Boolean).join('\n'), components:rows };
}
function buildPartyBossPayload(ownerId) {
  return { content:'## 👥 建立 PT\n第一步：選擇 Boss。', components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_pt_create_boss|${ownerId}`).setPlaceholder('選擇 Boss').addOptions(PT_BOSSES.map(([value,label])=>({label,value})))), buildBackHomeButton(ownerId)] };
}
function buildPartyCreateLayerPayload(ownerId, bossId, page = 0) {
  const layers = listLayersForBoss(bossId);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(layers.length / pageSize));
  const safePage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
  const items = layers.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const rows = [];
  if (items.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`msume_pt_create_layer|${ownerId}|${bossId}`)
    .setPlaceholder('可複選這個隊伍對應的 Layer')
    .setMinValues(1).setMaxValues(Math.min(items.length, 25))
    .addOptions(items.map(layer => ({ label: layer.name.slice(0,100), description: `Layer ${layer.layerId}`, value: layer.layerId })))));
  if (totalPages > 1) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`msume_pt_create_layer_page|${ownerId}|${bossId}|${safePage-1}`).setLabel('上一頁').setStyle(ButtonStyle.Secondary).setDisabled(safePage<=0),
    new ButtonBuilder().setCustomId(`msume_pt_create_layer_page|${ownerId}|${bossId}|${safePage+1}`).setLabel('下一頁').setStyle(ButtonStyle.Secondary).setDisabled(safePage>=totalPages-1)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`msume_pt_create|${ownerId}`).setLabel('返回 Boss').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`msume_home|${ownerId}`).setLabel('返回玩家中心').setEmoji('🏠').setStyle(ButtonStyle.Secondary)
  ));
  return { content:['## 👥 建立 PT',`Boss：**${ptLabel(PT_BOSSES,bossId)}**`,items.length?'第二步：只顯示此 Boss 對應的 Layer。':'❌ 此 Boss 尚未設定對應 Layer。',totalPages>1?`第 ${safePage+1}/${totalPages} 頁`:''].filter(Boolean).join('\n'), components:rows };
}
function formatSelectedLayers(layerIds) {
  return String(layerIds || '').split(',').filter(Boolean).map(getLayerName).join('、') || '未選擇';
}
function buildPartyCreateSourcePayload(ownerId,bossId,layerIds) {
  if (ownerId !== process.env.OWNER_ID) return buildPartyCharacterPayload(ownerId,bossId,layerIds);
  return { content:`## 👥 建立 PT\n${ptLabel(PT_BOSSES,bossId)}｜${formatSelectedLayers(layerIds)}\n第三步：選擇角色來源。`, components:[
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`msume_pt_create_mine|${ownerId}|${bossId}|${layerIds}`).setLabel('我的角色').setEmoji('👤').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`msume_pt_create_known|${ownerId}|${bossId}|${layerIds}`).setLabel('knownchar').setEmoji('🔒').setStyle(ButtonStyle.Secondary)
    ), buildBackHomeButton(ownerId)] };
}
function buildPartyCharacterPayload(ownerId,bossId,layerIds) {
  const chars=getCharacters(getBinding(ownerId));
  if(!chars.length) return {content:'❌ 沒有已啟用角色，請先到玩家設置啟用。',components:[buildBackHomeButton(ownerId)]};
  return {content:`## 👥 建立 PT\n${ptLabel(PT_BOSSES,bossId)}｜${formatSelectedLayers(layerIds)}\n第三步：選擇你的角色。`,components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_pt_create_char|${ownerId}|${bossId}|${layerIds}`).setPlaceholder('選擇已啟用角色').addOptions(chars.slice(0,25).map(c=>({label:`${c.alias || c.characterName}｜${c.characterName}`.slice(0,100),value:c.assetKey})))),buildBackHomeButton(ownerId)]};
}
function showPartyCharacterSearchModal(interaction, ownerId, partyId) {
  const modal = new ModalBuilder().setCustomId(`msume_pt_search_modal|${ownerId}|${partyId}`).setTitle('搜尋 PT 角色');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('query').setLabel('輸入角色名稱或 alias').setPlaceholder('輸入部分名稱即可搜尋').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(50)
  ));
  return interaction.showModal(modal);
}
function showKnownCharacterCreateSearchModal(interaction, ownerId, bossId, difficulty) {
  const modal = new ModalBuilder().setCustomId(`msume_pt_create_known_search_modal|${ownerId}|${bossId}|${difficulty}`).setTitle('搜尋 knownchar');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('query').setLabel('輸入 knownchar 或角色名稱').setPlaceholder('輸入部分名稱即可搜尋').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(50)
  ));
  return interaction.showModal(modal);
}
function searchPartyCharacters(query, includeKnown = false) {
  const keyword = String(query || '').trim().toLowerCase();
  if (!keyword) return [];
  const results = [];
  for (const [discordId, binding] of Object.entries(loadBindings())) {
    for (const character of getCharacters(binding)) {
      const alias = String(character.alias || '');
      const name = String(character.characterName || '');
      const haystack = `${alias} ${name}`.toLowerCase();
      if (!haystack.includes(keyword)) continue;
      const exact = alias.toLowerCase() === keyword || name.toLowerCase() === keyword;
      results.push({ sourceType:'binding', discordId, character, score: exact ? 0 : (haystack.startsWith(keyword) ? 1 : 2) });
    }
  }
  if (includeKnown) {
    for (const known of Object.values(loadKnownCharacters())) {
      const key = String(known.key || '');
      const name = String(known.characterName || '');
      const haystack = `${key} ${name}`.toLowerCase();
      if (!haystack.includes(keyword)) continue;
      const exact = key.toLowerCase() === keyword || name.toLowerCase() === keyword;
      results.push({ sourceType:'known', known, score: exact ? 0 : (haystack.startsWith(keyword) ? 1 : 2) });
    }
  }
  return results.sort((a,b) => a.score-b.score || String(a.character?.characterName || a.known?.characterName || '').localeCompare(String(b.character?.characterName || b.known?.characterName || ''), 'zh-Hant'));
}
function buildPartyCharacterSearchResultsPayload(ownerId, partyId, query) {
  const party = getPartyById(partyId);
  if (!party) return {content:'❌ 找不到隊伍。',components:[buildBackHomeButton(ownerId)]};
  const results = searchPartyCharacters(query, ownerId === process.env.OWNER_ID).filter(result => {
    const assetKey = result.character?.assetKey || result.known?.assetKey;
    return assetKey && !party.members.some(member => member.assetKey === assetKey);
  });
  if (!results.length) return {content:`## 🔎 搜尋角色
查無「${query}」的可加入角色。`,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_pt_view_button|${ownerId}|${partyId}`).setLabel('返回隊伍').setStyle(ButtonStyle.Secondary))]};
  const shown = results.slice(0,25);
  return {
    content:[`## 🔎 搜尋角色`,`關鍵字：**${query}**`,`找到 ${results.length} 筆結果${results.length>25?'，目前顯示前 25 筆，請輸入更完整名稱縮小範圍。':''}`,ownerId===process.env.OWNER_ID?'🛡️ OWNER 搜尋包含已啟用 DC 角色與 knownchar。':'只搜尋已綁定且已啟用的 DC 角色。'].join('\n'),
    components:[
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_pt_search_select|${ownerId}|${partyId}`).setPlaceholder('選擇要加入的角色').addOptions(shown.map(result => result.sourceType === 'known'
        ? {label:`${result.known.characterName}｜knownchar`.slice(0,100),description:`${result.known.key}｜外部角色`.slice(0,100),value:`k::${result.known.key}`}
        : {label:`${result.character.alias || result.character.characterName}｜${result.character.characterName}`.slice(0,100),description:`DC：${result.discordId}`.slice(0,100),value:`b::${result.discordId}::${result.character.assetKey}`}))),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_pt_view_button|${ownerId}|${partyId}`).setLabel('取消').setStyle(ButtonStyle.Secondary))
    ]
  };
}
function buildKnownCreateSearchResultsPayload(ownerId, bossId, layerId, query) {
  const results = searchPartyCharacters(query, true).filter(result => result.sourceType === 'known');
  if (!results.length) return {content:`## 🔒 knownchar 建隊
查無「${query}」。`,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_pt_create|${ownerId}`).setLabel('重新建立').setStyle(ButtonStyle.Secondary))]};
  const shown=results.slice(0,25);
  return {content:[`## 🔒 knownchar 建隊`,`關鍵字：**${query}**`,`找到 ${results.length} 筆結果${results.length>25?'，顯示前 25 筆。':''}`].join('\n'),components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_pt_create_known_select|${ownerId}|${bossId}|${layerId}`).setPlaceholder('選擇 knownchar').addOptions(shown.map(result=>({label:`${result.known.characterName}｜${result.known.key}`.slice(0,100),description:result.known.assetKey.slice(0,100),value:result.known.key})))),buildBackHomeButton(ownerId)]};
}
function getPartyLayerIds(party) {
  return listPartyLayers(party.name).map(row => String(row.layerId));
}
function buildPartyLayerPayload(ownerId, partyId, mode = 'home', page = 0) {
  const party = getPartyById(partyId);
  if (!party) return { content: '❌ 找不到隊伍。', components: [buildBackHomeButton(ownerId)] };
  const manage = canManageParty(party, ownerId, process.env.OWNER_ID);
  const selected = new Set(getPartyLayerIds(party));
  const bossLayers = listLayersForBoss(party.bossId);
  const selectedOutsideBoss = getLayerEntries().map(([layerId,name])=>({layerId:String(layerId),name:String(name)})).filter(x=>selected.has(x.layerId) && !bossLayers.some(layer=>layer.layerId===x.layerId));
  const allLayers = [...bossLayers, ...selectedOutsideBoss];
  const source = mode === 'remove' ? allLayers.filter(x => selected.has(x.layerId)) : allLayers.filter(x => !selected.has(x.layerId));
  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil(source.length / pageSize));
  const safePage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
  const items = source.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const selectedText = selected.size ? [...selected].map(id => `${id}｜${getLayerName(id)}`).join('、') : '尚未設定';
  const rows = [];
  if (manage && items.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`msume_pt_layer_${mode}|${ownerId}|${partyId}|${safePage}`)
    .setPlaceholder(mode === 'remove' ? '選擇要移除的 Layer' : '選擇要加入的 Layer')
    .setMinValues(1).setMaxValues(Math.min(items.length, 24))
    .addOptions(items.map(x => ({ label: x.name.slice(0,100), description: `Layer ${x.layerId}`.slice(0,100), value: x.layerId })))));
  if (manage) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`msume_pt_layer_page|${ownerId}|${partyId}|${mode}|${safePage-1}`).setLabel('上一頁').setStyle(ButtonStyle.Secondary).setDisabled(safePage <= 0),
    new ButtonBuilder().setCustomId(`msume_pt_layer_page|${ownerId}|${partyId}|${mode}|${safePage+1}`).setLabel('下一頁').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= totalPages-1),
    new ButtonBuilder().setCustomId(`msume_pt_layer_mode|${ownerId}|${partyId}|${mode === 'remove' ? 'add' : 'remove'}|0`).setLabel(mode === 'remove' ? '改為新增' : '改為移除').setStyle(ButtonStyle.Primary)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`msume_pt_view_button|${ownerId}|${partyId}`).setLabel('完成／返回隊伍').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`msume_pt_home|${ownerId}`).setLabel('返回我的隊伍').setStyle(ButtonStyle.Secondary)
  ));
  return { content: [`## 🎯 ${party.name}｜分寶 Layer`, `目前設定：${selectedText}`, '', mode === 'remove' ? '選擇要取消統計的 Layer。' : '選擇此 PT 會參與分寶與隊伍抽獎統計的 Layer。', `第 ${safePage+1}/${totalPages} 頁`].join('\n'), components: rows };
}

function buildPartyViewPayload(ownerId,partyId) {
  const party=getPartyById(partyId); if(!party) return {content:'❌ 找不到隊伍。',components:[buildBackHomeButton(ownerId)]};
  const manage=canManageParty(party,ownerId,process.env.OWNER_ID);
  const lines=party.members.map((m,i)=>`${i+1}. ${m.discordId ? `<@${m.discordId}>` : '🔒 外部角色'}｜**${m.alias || m.characterName}**${m.characterName && m.characterName!==m.alias ? `｜${m.characterName}`:''}${m.assetKey===party.leaderAssetKey?' 👑':''}`);
  const rows=[];
  if(manage) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`msume_pt_search|${ownerId}|${partyId}`).setLabel('新增角色').setEmoji('🔎').setStyle(ButtonStyle.Success).setDisabled(false),
    new ButtonBuilder().setCustomId(`msume_pt_remove_menu|${ownerId}|${partyId}`).setLabel('移除隊員').setEmoji('➖').setStyle(ButtonStyle.Secondary).setDisabled(party.members.length<=1),
    new ButtonBuilder().setCustomId(`msume_pt_leader_menu|${ownerId}|${partyId}`).setLabel('轉讓隊長').setEmoji('👑').setStyle(ButtonStyle.Primary).setDisabled(party.members.filter(m=>m.discordId && m.assetKey!==party.leaderAssetKey).length===0)
  ));
  if(manage) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`msume_pt_edit|${ownerId}|${partyId}`).setLabel('編輯隊伍').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`msume_pt_delete_confirm|${ownerId}|${partyId}`).setLabel('解散隊伍').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`msume_pt_layers|${ownerId}|${partyId}`).setLabel('分寶 Layer').setEmoji('🎯').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`msume_pt_raffle|${ownerId}|${partyId}`).setLabel('隊伍抽獎').setEmoji('🎲').setStyle(ButtonStyle.Success)
  ));
  const mine=party.members.filter(m=>m.discordId===ownerId && m.assetKey!==party.leaderAssetKey);
  if(mine.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_pt_leave|${ownerId}|${partyId}`).setPlaceholder('選擇自己的角色離開隊伍').addOptions(mine.map(m=>({label:`${m.alias || m.characterName}｜${m.characterName}`.slice(0,100),value:m.assetKey})))));
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_pt_home|${ownerId}`).setLabel('返回我的隊伍').setEmoji('👥').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`msume_home|${ownerId}`).setLabel('返回首頁').setEmoji('🏠').setStyle(ButtonStyle.Secondary)));
  return {content:[`## 👥 ${party.name}`,`Boss：**${ptLabel(PT_BOSSES,party.bossId)}**｜Layer：**${getPartyLayerIds(party).map(id=>getLayerName(id)).join('、') || '尚未設定'}**`,`隊長：<@${party.leaderDiscordId}>`,`成員：${party.members.length} 人（不限上限）`,'',lines.join('\n')||'無成員'].join('\n'),components:rows};
}


module.exports = { PT_BOSSES, PT_DIFFICULTIES, ptLabel, partyErrorMessage, buildPartyHomePayload, buildPartyBossPayload, buildPartyCreateLayerPayload, buildPartyCreateSourcePayload, buildPartyCharacterPayload, showPartyCharacterSearchModal, showKnownCharacterCreateSearchModal, searchPartyCharacters, buildPartyCharacterSearchResultsPayload, buildKnownCreateSearchResultsPayload, getPartyLayerIds, buildPartyLayerPayload, buildPartyViewPayload };
