'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getBinding } = require('../../services/bindingService');
const { getCharacterDetail } = require('../../services/msuApi');
const { formatArcText, formatArcFutureText, formatArcOptimizerText } = require('../../services/arcService');
const { findCharacterByAlias, getDefaultCharacter } = require('./characterUtils');
function parseTodayCompleted(value) {
  return value !== '0';
}

function buildArcButtons(ownerId, alias, targetDate = '', lacheleinDaily = '', todayCompleted = true) {
  const completedFlag = todayCompleted ? '1' : '0';

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`msume_arc_date|${ownerId}|${alias}|${targetDate}|${lacheleinDaily}|${completedFlag}`)
        .setLabel('修改日期')
        .setEmoji('📅')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`msume_arc_optimizer|${ownerId}|${alias}|${targetDate}|${lacheleinDaily}|${completedFlag}`)
        .setLabel('ARC 最佳化')
        .setEmoji('🎁')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`msume_arc_settings|${ownerId}|${alias}|${targetDate}|${lacheleinDaily}|${completedFlag}`)
        .setLabel('ARC 設定')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`msume_home|${ownerId}`)
        .setLabel('返回首頁')
        .setEmoji('🏠')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildArcSettingsPayload(ownerId, alias, targetDate = '', lacheleinDaily = '', todayCompleted = true) {
  const completedFlag = todayCompleted ? '1' : '0';
  const daily = lacheleinDaily ? Number(lacheleinDaily) : 10;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`msume_arc_settings_menu|${ownerId}|${alias}|${targetDate}|${lacheleinDaily}|${completedFlag}`)
    .setPlaceholder('選擇要調整的 ARC 設定')
    .addOptions(
      {
        label: todayCompleted ? '今日每日已完成' : '今日每日尚未完成',
        description: todayCompleted ? '目前從明日開始計算；點選可改為包含今日' : '目前包含今日每日；點選可改為從明日開始',
        value: 'toggle_today',
        emoji: todayCompleted ? '✅' : '❌'
      },
      {
        label: `拉契爾恩每日：${daily} 顆`,
        description: '調整拉契爾恩每日可取得的祕法符文數量',
        value: 'lachelein',
        emoji: '🏰'
      },
      {
        label: '重設 ARC 設定',
        description: '恢復今日已完成、拉契爾恩每日 10 顆',
        value: 'reset',
        emoji: '🔄'
      }
    );

  return {
    content: [
      '## ⚙️ ARC 設定',
      todayCompleted
        ? '☑️ 今日每日已完成｜預估從明日開始計算'
        : '☐ 今日每日尚未完成｜預估會包含今日每日',
      `🏰 拉契爾恩每日：${daily} 顆`,
      '',
      '請從下方選單選擇要調整的項目。'
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`msume_arc_back|${ownerId}|${alias}|${targetDate}|${lacheleinDaily}|${completedFlag}`)
          .setLabel('返回 ARC')
          .setEmoji('🌀')
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

async function buildArcPayload(
  ownerId,
  alias = '本尊',
  targetDate = '',
  lacheleinDaily = '',
  todayCompleted = true
) {
  const bind = getBinding(ownerId);
  if (!bind) throw new Error('BINDING_NOT_FOUND');

  const selectedCharacter = findCharacterByAlias(bind, alias) || getDefaultCharacter(bind);
  if (!selectedCharacter) throw new Error('CHARACTER_NOT_FOUND');

  const options = { todayCompleted };
  if (lacheleinDaily) options.lacheleinDaily = Number(lacheleinDaily);

  const character = await getCharacterDetail(selectedCharacter.assetKey);
  const content = targetDate
    ? formatArcFutureText(character, targetDate, options)
    : formatArcText(character, options);

  return {
    content,
    components: buildArcButtons(
      ownerId,
      selectedCharacter.alias || '本尊',
      targetDate,
      lacheleinDaily,
      todayCompleted
    )
  };
}

function buildArcOptimizerWarningPayload(ownerId, alias, targetDate = '', lacheleinDaily = '', todayCompleted = true) {
  const completedFlag = todayCompleted ? '1' : '0';
  return {
    content: [
      '## 🎁 ARC 最佳化',
      '此功能會先模擬每日進度到指定日期，再計算自選 ARC 的最大即時 ARC 配置。',
      '',
      '⚠️ **使用前請務必確認：**',
      '1. 角色目前是否已下線，讓 MapleStory N API 儲存最新資料。',
      '2. 今天的每日任務是否已完成。',
      '3. 畫面上的 ARC 等級與進度是否和遊戲內一致。',
      '',
      '請直接選擇今天每日的完成狀態。'
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`msume_arc_optimizer_daily|${ownerId}|${alias}|${targetDate}|${lacheleinDaily}|1`)
          .setLabel('今日每日已完成')
          .setEmoji('☑️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`msume_arc_optimizer_daily|${ownerId}|${alias}|${targetDate}|${lacheleinDaily}|0`)
          .setLabel('今日每日尚未完成')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`msume_arc_back|${ownerId}|${alias}|${targetDate}|${lacheleinDaily}|${completedFlag}`)
          .setLabel('返回 ARC')
          .setEmoji('🌀')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function getTodayIsoDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


module.exports = { parseTodayCompleted, buildArcButtons, buildArcSettingsPayload, buildArcPayload, buildArcOptimizerWarningPayload, getTodayIsoDate };
