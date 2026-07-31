'use strict';
const { handleInteraction } = require('./interactionHandler');
const { buildHome } = require('./settlementView');
const service = require('./settlementService');
function buildSettlementHomePayload(ownerId) {
  const isOwner = ownerId === process.env.OWNER_ID;
  const canManage = isOwner || service.manageableParties(ownerId, false).length > 0;
  return buildHome(ownerId, canManage);
}
module.exports = { handleSettlementInteraction: handleInteraction, buildSettlementHomePayload };
