const fs = require('fs');
const path = require('path');

const {
  getParty,
  listParties,
  saveParty,
  deleteParty,
  updateMemberWeight,
  findMember,
  addPartyLayer,
  removePartyLayer,
  listPartyLayers,
  migrateLegacyPartyMembers
} = require('../services/partyService');
const { getBinding } = require('../services/bindingService');

const layerNamesPath = path.join(__dirname, '..', 'data', 'layerNames.json');

migrateLegacyPartyMembers();

function loadLayerNames() {
  if (!fs.existsSync(layerNamesPath)) return [];

  const raw = JSON.parse(fs.readFileSync(layerNamesPath, 'utf8'));

  if (Array.isArray(raw)) {
    return raw.map(x => ({
      layerId: String(x.layerId ?? x.id),
      name: String(x.name ?? x.layerName ?? '')
    })).filter(x => x.layerId && x.name);
  }

  return Object.entries(raw).map(([layerId, name]) => ({
    layerId: String(layerId),
    name: typeof name === 'string'
      ? name
      : String(name.name ?? name.layerName ?? '')
  })).filter(x => x.layerId && x.name);
}

function resolveLayerInput(input) {
  const text = String(input || '').trim();
  if (!text) return { error: '請輸入 layerId 或 layer 名稱。' };

  const layers = loadLayerNames();

  const exactId = layers.find(x => String(x.layerId) === text);
  if (exactId) return { layer: exactId };

  if (/^\d+$/.test(text)) {
    return {
      layer: {
        layerId: text,
        name: `Layer ${text}`
      }
    };
  }

  const matches = layers.filter(x =>
    x.name.toLowerCase().includes(text.toLowerCase())
  );

  if (matches.length === 0) {
    return { error: `找不到符合「${text}」的 layer。` };
  }

  if (matches.length > 1) {
    return {
      candidates: matches.slice(0, 20)
    };
  }

  return { layer: matches[0] };
}

function formatLayerCandidates(candidates) {
  return [
    '找到多個符合的 Layer，請輸入更精準的名稱或直接用 layerId：',
    '```',
    candidates.map(x => `${x.layerId}｜${x.name}`).join('\n'),
    '```'
  ].join('\n');
}

function formatPartyLayers(partyName) {
  const layers = listPartyLayers(partyName);
  const layerNames = loadLayerNames();

  if (layers.length === 0) {
    return [
      `隊伍 ${partyName} 尚未設定統計 Layer。`,
      '',
      `請先設定：`,
      `\`>pt layer ${partyName} add 困難史烏\``
    ].join('\n');
  }

  const lines = layers.map(x => {
    const found = layerNames.find(n => String(n.layerId) === String(x.layerId));
    return `${x.layerId}｜${found?.name || '未知名稱'}`;
  });

  return [
    `🎯 隊伍 ${partyName} 的統計 Layer：`,
    '```',
    lines.join('\n'),
    '```'
  ].join('\n');
}

function formatParty(party) {
  const totalWeight = party.members.reduce((sum, m) => sum + Number(m.weight || 0), 0);

  const lines = party.members.map((m, index) => {
    const percent = totalWeight > 0
      ? `${((Number(m.weight) / totalWeight) * 100).toFixed(1)}%`
      : '0%';

    const display = m.characterName && m.characterName !== m.alias ? `${m.alias}｜${m.characterName}` : m.alias;
    const warning = m.bindingFound ? '' : ' ⚠️綁定待確認';
    return `${index + 1}. <@${m.discordId}>｜${display}${warning}｜權重 ${m.weight}｜${percent}`;
  });

  return [
    `👥 隊伍：${party.name}`,
    `成員：${party.members.length} 人（不限上限）`,
    `總權重：${totalWeight}`,
    '',
    '```',
    lines.join('\n') || '無成員',
    '```'
  ].join('\n');
}

function resolveBoundCharacter(discordId, input) {
  const binding = getBinding(discordId);
  if (!binding) return { error: `<@${discordId}> 尚未綁定角色。` };

  const text = String(input || '').trim().toLowerCase();
  const matches = binding.characters.filter(character =>
    character.assetKey?.toLowerCase() === text ||
    character.characterName?.toLowerCase() === text ||
    character.alias?.toLowerCase() === text
  );

  if (matches.length === 0) {
    const list = binding.characters.map(c => `• ${c.alias}｜${c.characterName}`).join('\n');
    return { error: `<@${discordId}> 找不到角色「${input}」。\n目前綁定：\n${list}` };
  }

  return { character: matches[0] };
}

function parseCreateArgs(message, args) {
  const partyName = args[1];
  if (!partyName) {
    return { error: '請輸入隊伍名稱，例如：`>pt 困露A @夜夜 本尊 @ET 主教`' };
  }

  const members = [];
  for (let i = 2; i < args.length; i++) {
    const mentionMatch = args[i].match(/^<@!?(\d+)>$/);
    if (!mentionMatch) continue;

    const discordId = mentionMatch[1];
    const input = args[i + 1];
    if (!input || input.startsWith('<@')) {
      return { error: '每個 @人 後面都要有角色別名或角色名稱，例如：`@夜夜 本尊`' };
    }

    const resolved = resolveBoundCharacter(discordId, input);
    if (resolved.error) return resolved;

    members.push({
      discordId,
      alias: resolved.character.alias,
      characterName: resolved.character.characterName,
      assetKey: resolved.character.assetKey,
      weight: 1
    });
    i++;
  }

  if (members.length === 0) return { error: '請至少標記一位隊員，例如：`>pt 困露A @夜夜 本尊`' };
  if (new Set(members.map(m => m.assetKey)).size !== members.length) {
    return { error: '同一個角色不能重複加入隊伍。' };
  }
  return { partyName, members };
}

function formatPartyList(parties) {
  if (parties.length === 0) {
    return '目前沒有任何隊伍。';
  }

  const lines = parties.map(p =>
    `${p.name}｜${p.memberCount} 人｜總權重 ${p.totalWeight}｜更新 ${p.updatedAt}`
  );

  return [
    '👥 目前隊伍：',
    '```',
    lines.join('\n'),
    '```'
  ].join('\n');
}

async function handleLayerCommand(message, args) {
  const partyName = args[2];
  const action = args[3]?.toLowerCase();
  const input = args.slice(4).join(' ');

  if (!partyName) {
    return message.reply(
      [
        '格式：',
        '`>pt layer 隊伍名`',
        '`>pt layer 隊伍名 add layerId或名稱`',
        '`>pt layer 隊伍名 remove layerId或名稱`'
      ].join('\n')
    );
  }

  const party = getParty(partyName);

  if (!party) {
    return message.reply(`找不到隊伍：${partyName}`);
  }

  if (!action) {
    return message.reply(formatPartyLayers(partyName));
  }

  if (action !== 'add' && action !== 'remove') {
    return message.reply('只能使用 `add` 或 `remove`。');
  }

  const resolved = resolveLayerInput(input);

  if (resolved.error) {
    return message.reply(resolved.error);
  }

  if (resolved.candidates) {
    return message.reply(formatLayerCandidates(resolved.candidates));
  }

  const { layer } = resolved;

  if (action === 'add') {
    addPartyLayer(partyName, layer.layerId);

    return message.reply(
      [
        `✅ 已加入隊伍統計 Layer：${partyName}`,
        `Layer：${layer.layerId}｜${layer.name}`,
        '',
        formatPartyLayers(partyName)
      ].join('\n')
    );
  }

  const changes = removePartyLayer(partyName, layer.layerId);

  if (!changes) {
    return message.reply(`隊伍 ${partyName} 沒有設定這個 Layer：${layer.layerId}｜${layer.name}`);
  }

  return message.reply(
    [
      `✅ 已移除隊伍統計 Layer：${partyName}`,
      `Layer：${layer.layerId}｜${layer.name}`,
      '',
      formatPartyLayers(partyName)
    ].join('\n')
  );
}

async function execute(message, args) {
  const sub = args[1]?.toLowerCase();

  if (!sub) {
    return message.reply(
      [
        'PT 指令：',
        '`>pt 隊伍名 @人 角色別名 @人 角色別名` 建立/覆蓋隊伍',
        '`>pt 隊伍名` 查看隊伍',
        '`>pt list` 查看所有隊伍',
        '`>pt delete 隊伍名` 刪除隊伍',
        '`>pt weight 隊伍名 @人 角色別名 權重` 調整權重',
        '`>pt layer 隊伍名` 查看隊伍統計 Layer',
        '`>pt layer 隊伍名 add layerId或名稱` 新增統計 Layer',
        '`>pt layer 隊伍名 remove layerId或名稱` 移除統計 Layer',
        '',
        '例如：',
        '`>pt 困露A @夜夜 本尊 @ET 主教`',
        '`>pt weight 困露A @夜夜 本尊 2`',
        '`>pt layer 困史A add 困難史烏`'
      ].join('\n')
    );
  }

  if (sub === 'list') {
    const parties = listParties();
    return message.reply(formatPartyList(parties));
  }

  if (sub === 'layer') {
    return handleLayerCommand(message, args);
  }

  if (sub === 'delete' || sub === 'remove') {
    const partyName = args[2];

    if (!partyName) {
      return message.reply('請輸入要刪除的隊伍名稱，例如：`>pt delete 困露A`');
    }

    const changes = deleteParty(partyName);

    if (!changes) {
      return message.reply(`找不到隊伍：${partyName}`);
    }

    return message.reply(`✅ 經過一震天崩地裂隊伍已解散：${partyName}`);
  }

  if (sub === 'weight') {
    const partyName = args[2];
    const user = message.mentions.users.first();

    const cleanArgs = args.slice(3).filter(arg =>
      !arg.startsWith('<@') && !arg.startsWith('<@!')
    );

    const characterInput = cleanArgs[0];
    const weight = Number(cleanArgs[1]);

    if (!partyName || !user || !characterInput || !Number.isFinite(weight) || weight < 0) {
      return message.reply(
        '格式：`>pt weight 隊伍名 @人 角色別名 權重`\n例如：`>pt weight 困露A @夜夜 本尊 2`'
      );
    }

    const party = getParty(partyName);

    if (!party) {
      return message.reply(`找不到隊伍：${partyName}`);
    }

    const member = findMember(partyName, user.id, characterInput);

    if (!member) {
      return message.reply(`${user} 的角色「${characterInput}」不在隊伍 ${partyName} 裡。`);
    }

    const changes = updateMemberWeight(partyName, user.id, member.assetKey, weight, member.id);

    if (!changes) {
      return message.reply('權重更新失敗。');
    }

    const updated = getParty(partyName);

    return message.reply(`✅ 已更新隊伍權重祝福你們分贓快樂\n\n${formatParty(updated)}`);
  }

  const isViewOnly =
    args.length === 2 &&
    message.mentions.users.size === 0;

  if (isViewOnly) {
    const partyName = args[1];
    const party = getParty(partyName);

    if (!party) {
      return message.reply(`找不到隊伍：${partyName}`);
    }

    return message.reply(formatParty(party));
  }

  const parsed = parseCreateArgs(message, args);

  if (parsed.error) {
    return message.reply(parsed.error);
  }

  const party = saveParty(
    parsed.partyName,
    message.author.id,
    parsed.members
  );

  return message.reply(
    [
      '✅神奇的魔法產生了就算不在MSU裡面你們還是組隊了',
      '',
      formatParty(party),
      '',
      '⚠️ 若要使用隊伍抽獎歷史摘要，請記得設定統計 Layer：',
      `\`>pt layer ${party.name} add 困難史烏\``
    ].join('\n')
  );
}

module.exports = {
  name: 'pt',
  execute
};