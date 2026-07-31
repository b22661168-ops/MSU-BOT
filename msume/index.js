'use strict';

const discord = require('discord.js');
const bindingService = require('../services/bindingService');
const arcService = require('../services/arcService');
const msuApi = require('../services/msuApi');
const raffleHistoryService = require('../services/raffleHistoryService');
const partyService = require('../services/partyService');
const knownCharacterService = require('../services/knownCharacterService');

const characterUtils = require('./modules/characterUtils');
const homeView = require('./modules/homeView');
const partyView = require('./modules/partyView');
const settingsView = require('./modules/settingsView');
const arcView = require('./modules/arcView');
const raffleView = require('./modules/raffleView');
const expView = require('./modules/expView');
const settlementModule = require('./modules/settlement');

const runtime = {
  ...discord,
  ...bindingService,
  ...arcService,
  ...msuApi,
  ...raffleHistoryService,
  ...partyService,
  ...knownCharacterService,
  ...characterUtils,
  ...homeView,
  ...partyView,
  ...settingsView,
  ...arcView,
  ...raffleView,
  ...expView,
  ...settlementModule
};

async function execute(message, args) {
  // 舊語法仍保留：>msuME 本尊 ARC [日期] [拉契每日]
  const alias = args[1];
  const feature = args[2]?.toLowerCase();

  if (feature === 'arc') {
    try {
      const payload = await arcView.buildArcPayload(
        message.author.id,
        alias || '本尊',
        args[3] || '',
        args[4] || ''
      );
      return message.reply(payload);
    } catch (error) {
      console.error(error.response?.data || error.message);
      return message.reply('❌ 查詢 ARC 失敗，請看終端機錯誤訊息。');
    }
  }

  const payload = await homeView.buildHomePayload(message.author.id);
  return message.reply(payload);
}

async function handleInteraction(interaction) {
  const { handleInteraction: dispatchInteraction } = require('./handlers/interactionHandler');
  return dispatchInteraction(interaction, runtime);
}

module.exports = { execute, handleInteraction };
