'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

function money(value) { return Number(value || 0).toLocaleString('en-US'); }
function compactMoney(value) {
  const amount = Number(value || 0); const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `${trim(amount / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${trim(amount / 1_000_000)}M`;
  if (abs >= 1_000) return `${trim(amount / 1_000)}K`;
  return String(amount);
}
function trim(value) { return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3))); }
function personLabel(member) { return member.characterName || member.alias || '未命名'; }
function mention(discordId, name) { return discordId ? `<@${discordId}>` : name; }
function back(ownerId) { return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_settle_home|${ownerId}`).setLabel('返回分帳中心').setStyle(ButtonStyle.Secondary)); }

function buildHome(ownerId, canManage) {
  const buttons = [];
  if (canManage) {
    buttons.push(
      new ButtonBuilder().setCustomId(`msume_settle_new|${ownerId}`).setLabel('隊伍結算').setEmoji('🧮').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`msume_settle_transfer|${ownerId}`).setLabel('轉帳中心').setEmoji('💸').setStyle(ButtonStyle.Success)
    );
  }
  buttons.push(new ButtonBuilder().setCustomId(`msume_settle_records|${ownerId}`).setLabel(canManage ? '結算紀錄' : '我的分帳').setEmoji('📚').setStyle(ButtonStyle.Secondary));
  return {
    content: ['## 💰 NESO 分帳中心', canManage ? '你可以管理自己擔任隊長的隊伍；一般隊員只能查看自己的分帳與轉帳資訊。' : '你只能查看自己參與的分帳與必要轉帳資訊。'].join('\n'),
    components: [new ActionRowBuilder().addComponents(...buttons), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_home_raffle|${ownerId}`).setLabel('返回抽獎中心').setStyle(ButtonStyle.Secondary))]
  };
}

function buildPartySelect(ownerId, parties) {
  if (!parties.length) return { content: '❌ 你目前沒有可管理的 PT。只有隊長或管理員可以建立分帳。', components: [back(ownerId)] };
  return {
    content: '## 🧮 選擇要結算的隊伍\n只有隊長或管理員可以建立及修改分帳。',
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_settle_party|${ownerId}`).setPlaceholder('選擇 PT').addOptions(parties.slice(0, 25).map(p => ({ label: String(p.name).slice(0, 100), description: `${p.memberCount || 0} 人`, value: p.partyId })))),
      back(ownerId)
    ]
  };
}

function buildDraft(ownerId, draft) {
  const lines = draft.members.map(m => {
    const diff = m.actual - m.expected;
    return `${personLabel(m)}｜權重 ${m.weight}｜實拿 ${compactMoney(m.actual)}｜應得 ${compactMoney(m.expected)}｜${diff > 0 ? `應付 ${compactMoney(diff)}` : diff < 0 ? `應收 ${compactMoney(-diff)}` : '剛好'}`;
  });
  const warnings = draft.missing?.length ? `\n\n⚠️ 缺漏\n${draft.missing.join('\n')}` : '';
  return {
    content: [`## 🧮 ${draft.partyName}｜${draft.settledDate}`, `總 NESO：**${compactMoney(draft.totalNeso)}**｜總權重：**${draft.totalWeight}**`, '', ...lines, warnings].join('\n').slice(0, 1950),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`msume_settle_weights|${ownerId}`).setLabel('設定權重').setEmoji('⚖️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`msume_settle_save|${ownerId}`).setLabel('儲存結算').setEmoji('💾').setStyle(ButtonStyle.Success).setDisabled(draft.totalNeso <= 0 || draft.totalWeight <= 0),
        new ButtonBuilder().setCustomId(`msume_settle_new|${ownerId}`).setLabel('換隊伍').setStyle(ButtonStyle.Secondary)
      ), back(ownerId)
    ]
  };
}

function buildTransferSelect(ownerId, settlements) {
  if (!settlements.length) return { content: '## 💸 轉帳中心\n目前沒有你可管理且「已計算、尚未加入轉帳」的隊伍。\n已建立的批次請到「結算紀錄」查看及完成。', components: [back(ownerId)] };
  return {
    content: '## 💸 轉帳中心\n勾選要一起抵銷的隊伍結算。建立批次後，請到「結算紀錄」查看或標記完成。',
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_settle_transfer_select|${ownerId}`).setPlaceholder('選擇要合併的隊伍').setMinValues(1).setMaxValues(Math.min(25, settlements.length)).addOptions(settlements.map(s => ({ label: `${s.partyName}｜${s.settledDate}`.slice(0, 100), description: `${money(s.totalNeso)} NESO`, value: s.id })))),
      back(ownerId)
    ]
  };
}

function buildPlan(ownerId, settlements, plan, token) {
  const source = settlements.map(s => `• ${s.partyName}｜${s.settledDate}｜${money(s.totalNeso)}`).join('\n');
  const groups = new Map();
  for (const t of plan.transfers) { if (!groups.has(t.fromIdentityKey)) groups.set(t.fromIdentityKey, []); groups.get(t.fromIdentityKey).push(t); }
  const sections = [];
  for (const transfers of groups.values()) {
    const first = transfers[0]; const total = transfers.reduce((sum, x) => sum + x.amount, 0);
    sections.push(`### ${mention(first.fromDiscordId, first.fromCharacterName)} 請轉 ${money(total)} NESO`);
    for (const item of transfers) {
      sections.push(`➡️ ${mention(item.toDiscordId, item.toCharacterName)}｜**${money(item.amount)} NESO**`);
      sections.push(item.toWallet ? `收款錢包：\`${item.toWallet}\`` : '收款錢包：⚠️ 查無資料');
    }
  }
  if (!sections.length) sections.push('✅ 全部抵銷，無需轉帳。');
  return {
    content: ['## 💸 最簡轉帳結果', '### 納入隊伍', source, '', ...sections, '', `驗算：實拿 ${money(plan.totalActual)}｜應得 ${money(plan.totalExpected)}｜差額 ${money(plan.balanceError)}`, `轉帳筆數：${plan.transfers.length}`].join('\n').slice(0, 1800),
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`msume_settle_batch_save|${ownerId}|${token}`).setLabel('建立轉帳批次').setEmoji('💾').setStyle(ButtonStyle.Success).setDisabled(!plan.valid),
      new ButtonBuilder().setCustomId(`msume_settle_transfer|${ownerId}`).setLabel('重新選擇').setStyle(ButtonStyle.Secondary)
    )]
  };
}

function buildRecords(ownerId, records) {
  if (!records.length) return { content: '## 📚 NESO 結算紀錄\n目前沒有你可查看的紀錄。', components: [back(ownerId)] };
  const status = { PENDING: '🧮 待建立轉帳', IN_BATCH: '💸 轉帳中', DONE: '✅ 已完成' };
  return {
    content: '## 📚 NESO 結算紀錄\n請選擇一筆查看。隊員只會看到自己的資料。',
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_settle_record_select|${ownerId}`).setPlaceholder('選擇結算紀錄').addOptions(records.slice(0, 25).map(r => ({ label: `${r.partyName}｜${r.settledDate}`.slice(0,100), description: `${status[r.status] || r.status}｜${compactMoney(r.totalNeso)}`.slice(0,100), value: r.id })))),
      back(ownerId)
    ]
  };
}

function buildRecordDetail(ownerId, settlement, batch, canManage, viewerId) {
  const status = { PENDING: '🧮 待建立轉帳', IN_BATCH: '💸 轉帳中', DONE: '✅ 已完成' };
  const lines = [`## 📚 ${settlement.partyName}｜${settlement.settledDate}`, `狀態：${status[settlement.status] || settlement.status}`, `總 NESO：${money(settlement.totalNeso)}`];
  if (canManage) {
    lines.push('', '### 完整分帳');
    for (const m of settlement.members) {
      const diff = m.actual - m.expected;
      lines.push(`${personLabel(m)}｜權重 ${m.weight}｜實拿 ${compactMoney(m.actual)}｜應得 ${compactMoney(m.expected)}｜${diff > 0 ? `應付 ${compactMoney(diff)}` : diff < 0 ? `應收 ${compactMoney(-diff)}` : '剛好'}`);
    }
  } else {
    const mine = settlement.members.filter(m => m.discordId === viewerId);
    lines.push('', '### 我的分帳');
    if (!mine.length) lines.push('這筆結算找不到你的角色資料。');
    for (const m of mine) {
      const diff = m.actual - m.expected;
      lines.push(`${personLabel(m)}｜實拿 ${compactMoney(m.actual)}｜應得 ${compactMoney(m.expected)}｜${diff > 0 ? `應付 ${compactMoney(diff)}` : diff < 0 ? `應收 ${compactMoney(-diff)}` : '剛好'}`);
    }
  }
  if (batch) {
    const transfers = canManage ? batch.transfers : batch.transfers.filter(t => t.fromDiscordId === viewerId || t.toDiscordId === viewerId);
    lines.push('', `### 轉帳批次｜${batch.status === 'DONE' ? '✅ 已完成' : '⏳ 進行中'}`);
    if (!transfers.length) lines.push('你在此批次無需轉帳或收款。');
    for (const t of transfers) {
      if (canManage || t.fromDiscordId === viewerId) lines.push(`➡️ 付款：${mention(t.fromDiscordId, t.fromCharacterName)} → ${mention(t.toDiscordId, t.toCharacterName)}｜${money(t.amount)} NESO${t.toWallet ? `\n收款錢包：\`${t.toWallet}\`` : ''}`);
      else lines.push(`⬅️ 收款：${mention(t.fromDiscordId, t.fromCharacterName)} → ${mention(t.toDiscordId, t.toCharacterName)}｜${money(t.amount)} NESO`);
    }
  }
  const rows = [];
  if (canManage && batch?.status === 'OPEN') rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_settle_batch_done|${ownerId}|${batch.id}`).setLabel('標記全部已轉帳').setEmoji('✅').setStyle(ButtonStyle.Success)));
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_settle_records|${ownerId}`).setLabel('返回結算紀錄').setStyle(ButtonStyle.Secondary)));
  return { content: lines.join('\n').slice(0, 1950), components: rows };
}

module.exports = { buildHome, buildPartySelect, buildDraft, buildTransferSelect, buildPlan, buildRecords, buildRecordDetail };
