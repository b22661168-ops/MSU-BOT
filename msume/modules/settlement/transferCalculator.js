'use strict';

function normalizeIdentity(member) {
  if (member.discordId) return `discord:${member.discordId}`;
  if (member.wallet) return `wallet:${String(member.wallet).toLowerCase()}`;
  return `asset:${member.assetKey || member.characterName || member.alias}`;
}

function combineSettlements(settlements) {
  const people = new Map();
  let totalActual = 0;
  let totalExpected = 0;

  for (const settlement of settlements) {
    for (const member of settlement.members || []) {
      const identityKey = member.identityKey || normalizeIdentity(member);
      if (!people.has(identityKey)) {
        people.set(identityKey, {
          identityKey,
          discordId: member.discordId || null,
          assetKey: member.assetKey || null,
          alias: member.alias || null,
          characterName: member.characterName || member.alias || '未知角色',
          wallet: member.wallet || null,
          actual: 0,
          expected: 0,
          sources: []
        });
      }

      const person = people.get(identityKey);
      person.actual += Number(member.actual || 0);
      person.expected += Number(member.expected || 0);
      if (!person.wallet && member.wallet) person.wallet = member.wallet;
      if (!person.discordId && member.discordId) person.discordId = member.discordId;
      person.sources.push({
        settlementId: settlement.id,
        partyName: settlement.partyName,
        actual: Number(member.actual || 0),
        expected: Number(member.expected || 0)
      });
      totalActual += Number(member.actual || 0);
      totalExpected += Number(member.expected || 0);
    }
  }

  const balances = [...people.values()].map(person => ({
    ...person,
    net: person.actual - person.expected
  }));

  return { balances, totalActual, totalExpected };
}

function generateTransfers(balances) {
  const payers = balances
    .filter(x => x.net > 0)
    .map(x => ({ ...x, remaining: x.net }))
    .sort((a, b) => b.remaining - a.remaining);
  const receivers = balances
    .filter(x => x.net < 0)
    .map(x => ({ ...x, remaining: Math.abs(x.net) }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers = [];
  let payerIndex = 0;
  let receiverIndex = 0;

  while (payerIndex < payers.length && receiverIndex < receivers.length) {
    const payer = payers[payerIndex];
    const receiver = receivers[receiverIndex];
    const amount = Math.min(payer.remaining, receiver.remaining);

    if (amount > 0) {
      transfers.push({
        fromIdentityKey: payer.identityKey,
        fromDiscordId: payer.discordId,
        fromCharacterName: payer.characterName,
        fromWallet: payer.wallet,
        toIdentityKey: receiver.identityKey,
        toDiscordId: receiver.discordId,
        toCharacterName: receiver.characterName,
        toWallet: receiver.wallet,
        amount
      });
    }

    payer.remaining -= amount;
    receiver.remaining -= amount;
    if (payer.remaining === 0) payerIndex += 1;
    if (receiver.remaining === 0) receiverIndex += 1;
  }

  return transfers;
}

function calculateTransferPlan(settlements) {
  const combined = combineSettlements(settlements);
  const transfers = generateTransfers(combined.balances);
  const totalTransfer = transfers.reduce((sum, item) => sum + item.amount, 0);
  const balanceError = combined.totalActual - combined.totalExpected;

  return {
    ...combined,
    transfers,
    totalTransfer,
    balanceError,
    valid: balanceError === 0
  };
}

module.exports = { normalizeIdentity, combineSettlements, generateTransfers, calculateTransferPlan };
