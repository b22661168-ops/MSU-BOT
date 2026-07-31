'use strict';

const crypto = require('crypto');
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const service = require('./settlementService');
const view = require('./settlementView');

const drafts = new Map();
const plans = new Map();
function draftKey(ownerId) { return `draft:${ownerId}`; }
function planKey(ownerId, token) { return `plan:${ownerId}:${token}`; }
function verifyOwner(interaction, ownerId) {
  if (interaction.user.id === ownerId) return true;
  interaction.reply({ content: '❌ 這不是你的操作面板。', ephemeral: true }).catch(() => {});
  return false;
}
function context(interaction) {
  const userId = interaction.user.id;
  const isAdmin = service.isAdminInteraction(interaction);
  const parties = service.manageableParties(userId, isAdmin);
  return { userId, isAdmin, parties, canManageAny: parties.length > 0 };
}
function deny(interaction) { return interaction.reply({ content: '❌ 只有此 PT 的隊長或管理員可以進行這項操作。', ephemeral: true }); }
function assertPartyAccess(interaction, partyId) {
  const c = context(interaction);
  if (!service.canManagePartyId(partyId, c.userId, c.isAdmin)) return null;
  return c;
}
function assertSettlementAccess(interaction, settlement) {
  const c = context(interaction);
  if (!service.canManageSettlement(settlement, c.userId, c.isAdmin)) return null;
  return c;
}

function showDateModal(interaction, ownerId, partyId) {
  const modal = new ModalBuilder().setCustomId(`msume_settle_date_modal|${ownerId}|${partyId}`).setTitle('隊伍 NESO 結算');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('settledDate').setLabel('開獎日期 YYYY-MM-DD').setPlaceholder('例如：2026-07-31').setStyle(TextInputStyle.Short).setRequired(true)
  ));
  return interaction.showModal(modal);
}
function showWeightModal(interaction, ownerId, draft) {
  const modal = new ModalBuilder().setCustomId(`msume_settle_weights_modal|${ownerId}`).setTitle('設定分帳權重');
  const value = draft.members.map(member => `${member.characterName || member.alias}=${member.weight}`).join('\n').slice(0, 4000);
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('weights').setLabel('每行：角色名稱=權重').setPlaceholder('CloudDarling=1\noLAVAZZAo=0.5').setValue(value).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)
  ));
  return interaction.showModal(modal);
}

async function handleInteraction(interaction) {
  const parts = String(interaction.customId || '').split('|');
  const action = parts[0]; const ownerId = parts[1];
  if (!action.startsWith('msume_settle_')) return false;
  if (!verifyOwner(interaction, ownerId)) return true;

  try {
    const c = context(interaction);
    if (interaction.isButton()) {
      if (action === 'msume_settle_home') return interaction.update(view.buildHome(ownerId, c.canManageAny || c.isAdmin));
      if (action === 'msume_settle_new') {
        if (!c.canManageAny && !c.isAdmin) return deny(interaction);
        return interaction.update(view.buildPartySelect(ownerId, c.parties));
      }
      if (action === 'msume_settle_transfer') {
        if (!c.canManageAny && !c.isAdmin) return deny(interaction);
        return interaction.update(view.buildTransferSelect(ownerId, service.listPendingFor(c.userId, c.isAdmin)));
      }
      if (action === 'msume_settle_records') return interaction.update(view.buildRecords(ownerId, service.listRecentFor(c.userId, c.isAdmin)));

      if (action === 'msume_settle_weights' || action === 'msume_settle_save') {
        const draft = drafts.get(draftKey(ownerId));
        if (!draft) return interaction.reply({ content: '❌ 暫存結算已失效，請重新選擇隊伍。', ephemeral: true });
        if (!assertPartyAccess(interaction, draft.partyId)) return deny(interaction);
        if (action === 'msume_settle_weights') return showWeightModal(interaction, ownerId, draft);
        const saved = service.saveDraft(draft, ownerId);
        drafts.delete(draftKey(ownerId));
        return interaction.update({
          content: `✅ 已儲存 **${saved.partyName}｜${saved.settledDate}**\n總 NESO：${Number(saved.totalNeso).toLocaleString()}\n可前往轉帳中心建立批次；建立後會保留在「結算紀錄」中。`,
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`msume_settle_new|${ownerId}`).setLabel('計算下一隊').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`msume_settle_transfer|${ownerId}`).setLabel('前往轉帳中心').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`msume_settle_records|${ownerId}`).setLabel('結算紀錄').setStyle(ButtonStyle.Secondary)
          )]
        });
      }

      if (action === 'msume_settle_batch_save') {
        const token = parts[2]; const bundle = plans.get(planKey(ownerId, token));
        if (!bundle) return interaction.reply({ content: '❌ 轉帳預覽已失效，請重新計算。', ephemeral: true });
        if (bundle.settlements.some(s => !service.canManageSettlement(s, c.userId, c.isAdmin))) return deny(interaction);
        const batchId = service.createTransferBatch(bundle.ids, bundle.plan, ownerId);
        plans.delete(planKey(ownerId, token));
        const batch = service.getTransferBatch(batchId);
        return interaction.update({
          content: `${view.buildPlan(ownerId, bundle.settlements, bundle.plan, token).content.slice(0, 1700)}\n\n✅ 已建立轉帳批次，之後可從「結算紀錄」再次開啟及標記完成。`,
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`msume_settle_batch_done|${ownerId}|${batch.id}`).setLabel('標記全部已轉帳').setEmoji('✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`msume_settle_records|${ownerId}`).setLabel('前往結算紀錄').setStyle(ButtonStyle.Secondary)
          )]
        });
      }

      if (action === 'msume_settle_batch_done') {
        const batch = service.getTransferBatch(parts[2]);
        if (!batch) return interaction.reply({ content: '❌ 找不到轉帳批次。', ephemeral: true });
        if (batch.settlements.some(s => !service.canManageSettlement(s, c.userId, c.isAdmin))) return deny(interaction);
        const count = service.completeTransferBatch(batch.id);
        return interaction.update({ content: `✅ 已完成轉帳批次，共結案 ${count} 支隊伍。`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_settle_records|${ownerId}`).setLabel('返回結算紀錄').setStyle(ButtonStyle.Secondary))] });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (action === 'msume_settle_party') {
        const partyId = interaction.values[0];
        if (!assertPartyAccess(interaction, partyId)) return deny(interaction);
        return showDateModal(interaction, ownerId, partyId);
      }
      if (action === 'msume_settle_transfer_select') {
        const ids = interaction.values;
        const { settlements, plan } = service.buildPlan(ids);
        if (settlements.some(s => !service.canManageSettlement(s, c.userId, c.isAdmin))) return deny(interaction);
        const token = crypto.randomBytes(5).toString('hex');
        plans.set(planKey(ownerId, token), { ids, settlements, plan });
        return interaction.update(view.buildPlan(ownerId, settlements, plan, token));
      }
      if (action === 'msume_settle_record_select') {
        const settlement = service.getSettlement(interaction.values[0]);
        if (!settlement) return interaction.reply({ content: '❌ 找不到結算紀錄。', ephemeral: true });
        const canManage = service.canManageSettlement(settlement, c.userId, c.isAdmin);
        const isMember = settlement.members.some(m => m.discordId === c.userId);
        if (!canManage && !isMember) return interaction.reply({ content: '❌ 你無權查看這筆分帳。', ephemeral: true });
        const batch = service.getBatchBySettlementId(settlement.id);
        return interaction.update(view.buildRecordDetail(ownerId, settlement, batch, canManage, c.userId));
      }
    }

    if (interaction.isModalSubmit()) {
      if (action === 'msume_settle_date_modal') {
        const partyId = parts[2];
        if (!assertPartyAccess(interaction, partyId)) return deny(interaction);
        const date = service.normalizeDate(interaction.fields.getTextInputValue('settledDate'));
        if (!date) return interaction.reply({ content: '❌ 日期格式錯誤，請輸入 YYYY-MM-DD。', ephemeral: true });
        const draft = service.buildPartyDraft(partyId, date);
        drafts.set(draftKey(ownerId), draft);
        return interaction.update(view.buildDraft(ownerId, draft));
      }
      if (action === 'msume_settle_weights_modal') {
        const draft = drafts.get(draftKey(ownerId));
        if (!draft) return interaction.reply({ content: '❌ 暫存結算已失效，請重新選擇隊伍。', ephemeral: true });
        if (!assertPartyAccess(interaction, draft.partyId)) return deny(interaction);
        service.applyWeightText(draft, interaction.fields.getTextInputValue('weights'));
        drafts.set(draftKey(ownerId), draft);
        return interaction.update(view.buildDraft(ownerId, draft));
      }
    }
    return true;
  } catch (error) {
    console.error('===== MSUME SETTLEMENT ERROR ====='); console.error(error.stack || error.message);
    let content = '❌ NESO 分帳操作失敗。';
    if (error.message === 'PARTY_NOT_FOUND') content = '❌ 找不到這支隊伍。';
    else if (error.message === 'NO_PARTY_LAYERS') content = '❌ 這支 PT 尚未設定 Layer。';
    else if (error.message.startsWith('WEIGHT_FORMAT:')) content = `❌ 權重格式錯誤：${error.message.split(':').slice(1).join(':')}。請使用「角色名稱=權重」。`;
    else if (error.message.startsWith('WEIGHT_VALUE:')) content = '❌ 權重必須是 0～100 的數字。';
    if (interaction.deferred || interaction.replied) return interaction.editReply({ content, components: [] }).catch(() => {});
    return interaction.reply({ content, ephemeral: true }).catch(() => {});
  }
}
module.exports = { handleInteraction };
