const {
  getBinding,
  loadBindings,
  removeBinding,
  removeCharacter
} = require('../services/bindingService');
const {
  listUserParties,
  getPartyById,
  archivePartyV2,
  removePartyMemberV2,
  transferPartyLeader,
  updatePartyV2,
  findPartiesByDiscord
} = require('../services/partyService');
const expRepo = require('../services/expTracker/repository');
const { addTrackedCharacter, runJob, updateCountChannel, scheduleCountChannelUpdate, taipeiDate, rebuildAllRankings, buildReport } = require('../services/expTracker/service');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { findKnownCharacterCandidates, getKnownCharacterByAssetKey } = require('../services/knownCharacterService');


function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function looksLikeAssetKey(value) {
  const text = String(value || '').trim();
  return /^0x[a-f0-9]{16,}$/i.test(text) || /^(char|character)[-_]/i.test(text) || text.length >= 24;
}

function allBoundCharacters() {
  const bindings = loadBindings();
  const rows = [];
  for (const [discordId, rawBinding] of Object.entries(bindings)) {
    const binding = getBinding(discordId);
    for (const character of binding?.characters || []) {
      rows.push({ discordId, ...character });
    }
  }
  return rows;
}

function resolveMentionedBoundCharacter(message, args) {
  const user = message.mentions.users.first();
  if (!user) return null;
  const mentionIndex = args.findIndex(arg => /^<@!?\d+>$/.test(arg));
  const input = args.slice(mentionIndex + 1).join(' ').trim();
  if (!input) return { error: '格式：`>sudo exp add @玩家 別名/角色名稱`' };
  const binding = getBinding(user.id);
  if (!binding) return { error: `${user} 尚未綁定角色。` };
  const text = normalizeText(input);
  const matches = binding.characters.filter(c =>
    normalizeText(c.alias) === text ||
    normalizeText(c.characterName) === text ||
    normalizeText(c.assetKey) === text
  );
  if (!matches.length) {
    return { error: [`${user} 找不到「${input}」。`, '目前綁定：', ...binding.characters.map(c => `• ${c.alias}｜${c.characterName}`)].join('\n') };
  }
  return { character: matches[0] };
}

function findLocalCharacterCandidates(input) {
  const text = normalizeText(input);
  if (!text) return [];
  const map = new Map();

  // KnownChar 是人工確認過的角色資料，優先級最高。
  for (const c of findKnownCharacterCandidates(input)) {
    if (!c.assetKey) continue;
    map.set(c.assetKey, {
      ...c,
      alias: c.key,
      exact: Boolean(c.exact),
      source: 'KnownChar'
    });
  }

  for (const c of allBoundCharacters()) {
    const exact = [c.alias, c.characterName, c.assetKey].some(v => normalizeText(v) === text);
    const partial = [c.alias, c.characterName].some(v => normalizeText(v).includes(text));
    if (exact || partial) {
      const previous = map.get(c.assetKey);
      map.set(c.assetKey, { ...previous, ...c, exact: exact || Boolean(previous?.exact), source: previous?.source || 'Binding' });
    }
  }
  for (const c of expRepo.listCharacters(false)) {
    const exact = [c.characterName, c.assetKey].some(v => normalizeText(v) === text);
    const partial = normalizeText(c.characterName).includes(text);
    if (exact || partial) {
      const previous = map.get(c.assetKey);
      map.set(c.assetKey, { ...previous, ...c, exact: exact || Boolean(previous?.exact), source: previous?.source || 'EXP Tracker' });
    }
  }
  return [...map.values()].sort((a,b) => Number(b.exact)-Number(a.exact) || String(a.characterName).localeCompare(String(b.characterName)));
}

function extractApiCharacterCandidates(payload) {
  const pools = [
    payload?.data?.characters,
    payload?.data?.results,
    payload?.characters,
    payload?.results,
    Array.isArray(payload?.data) ? payload.data : null,
    Array.isArray(payload) ? payload : null
  ].find(Array.isArray) || [];
  return pools.map(c => ({
    assetKey: c.assetKey || c.characterAssetKey || c.key,
    characterName: c.name || c.characterName || c.character_name,
    jobName: c.jobName || c.job || c.className
  })).filter(c => c.assetKey && c.characterName);
}

function resolveExpAddTarget(message, args) {
  const input = args.slice(3).join(' ').trim();
  if (!input) {
    return { error: '格式：`>sudo exp add <KnownChar Key／角色名稱／assetKey>`' };
  }

  const directByAssetKey = getKnownCharacterByAssetKey(input);
  if (directByAssetKey) return { character: { ...directByAssetKey, source: 'KnownChar' } };

  const candidates = findKnownCharacterCandidates(input);
  const exact = candidates.filter(character => character.exact);
  if (exact.length === 1) return { character: exact[0] };
  if (candidates.length === 1) return { character: candidates[0] };
  if (candidates.length > 1) {
    return { candidates: candidates.slice(0, 15), source: 'KnownChar' };
  }

  return {
    error: [
      `KnownChar 找不到「${input}」。`,
      '請先使用：',
      '`>knownchar add <角色名稱> [wallet]`',
      '驗證並保存角色後，再加入 EXP Tracker。'
    ].join('\n')
  };
}

function formatExpCandidates(result) {
  return [
    `找到多個候選（${result.source}），請改用 \`@玩家 別名\`，或複製 assetKey 新增：`,
    '```',
    ...result.candidates.map(c => `${c.characterName || '未知角色'}${c.alias ? `｜${c.alias}` : ''}${c.discordId ? `｜Discord ${c.discordId}` : ''}\n${c.assetKey}`),
    '```'
  ].join('\n');
}


function formatRankChange(value) {
  if (value == null || Number(value) === 0) return '—';
  return Number(value) > 0 ? `▲${value}` : `▼${Math.abs(Number(value))}`;
}

function formatSnapshotLine(row, index = null) {
  const gained = row.gainedExp == null
    ? '首次快照'
    : `${BigInt(row.gainedExp) >= 0n ? '+' : ''}${require('../services/expTracker/service').formatBigInt(row.gainedExp)}`;
  const prefix = index == null ? '' : `${index}. `;
  return `${prefix}**${row.characterName}**${row.jobName ? `｜${row.jobName}` : ''}\n` +
    `   Lv.${row.level}｜目前 ${require('../services/expTracker/service').formatBigInt(row.currentExp)} / ${require('../services/expTracker/service').formatBigInt(row.requiredExp)}｜${require('../services/expTracker/service').formatExpRate(row.expRate)}｜今日 ${gained}\n` +
    `   圈內 #${row.localRank || '—'} ${formatRankChange(row.localRankChange)}｜世界 ${row.worldRank ? `#${row.worldRank}` : '—'} ${formatRankChange(row.worldRankChange)}\n` +
    `   取得：${new Date(row.capturedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
}

function resolveTrackedCharacter(input) {
  const local = findLocalCharacterCandidates(input).filter(c => expRepo.getCharacter(c.assetKey));
  const exact = local.filter(c => c.exact);
  if (exact.length === 1) return { character: exact[0] };
  if (local.length === 1) return { character: local[0] };
  if (local.length > 1) return { candidates: local };
  return { error: `找不到追蹤中的角色「${input}」。` };
}


function resolveReportDate(input) {
  const requested = String(input || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(requested) && expRepo.getSnapshots(requested).length) return requested;
  const today = taipeiDate();
  if (expRepo.getSnapshots(today).length) return today;
  const dates = expRepo.listSnapshotDates();
  return dates.length ? dates[dates.length - 1] : null;
}

async function sendTestReport(message, date) {
  const channelId = process.env.EXP_REPORT_CHANNEL_ID || expRepo.getSetting('reportChannelId') || process.env.EXP_TRACKER_REPORT_CHANNEL_ID;
  if (!channelId) throw new Error('尚未設定 EXP_REPORT_CHANNEL_ID。');
  const channel = await message.client.channels.fetch(channelId);
  if (!channel?.isTextBased?.()) throw new Error('EXP_REPORT_CHANNEL_ID 不是可發送訊息的文字頻道。');
  const sent = await channel.send(buildReport(date));
  return { channel, sent };
}

function formatBinding(user, binding) {
  const lines = binding.characters.map((character, index) => {
    const flags = [character.isDefault ? '⭐ 本尊' : null, character.isEnabled === false ? '⏸️ 未啟用' : '✅ 已啟用'].filter(Boolean).join('｜');
    return `${index + 1}. ${character.alias || '未命名'}｜${character.characterName || '未知角色'}\n   ${flags}\n   assetKey：${character.assetKey}\n   錢包：${character.wallet}`;
  });
  return [`## 🔐 ${user.username} 的綁定資料`, `角色數：${binding.characters.length}`, '', lines.join('\n\n') || '目前沒有角色。'].join('\n');
}

function findParty(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  return getPartyById(text) || listUserParties('', true).map(p => getPartyById(p.partyId)).find(p => p?.name.toLowerCase() === text.toLowerCase()) || null;
}

function formatParty(party) {
  const members = party.members.map((m, i) => `${i + 1}. ${m.discordId ? `<@${m.discordId}>` : '🔒 外部角色'}｜${m.alias || m.characterName}｜${m.characterName || '未知'}${m.assetKey === party.leaderAssetKey ? ' 👑' : ''}\n   assetKey：${m.assetKey}`).join('\n');
  return [`## 👥 ${party.name}`, `partyId：${party.partyId}`, `Boss：${party.difficulty || '?'} / ${party.bossId || '?'}`, `隊長：<@${party.leaderDiscordId}>`, `成員：${party.members.length} 人（不限上限）`, '', members || '無成員'].join('\n');
}

module.exports = {
  name: 'sudo',
  async execute(message, args) {
    if (message.author.id !== process.env.OWNER_ID) return;
    const group = args[1]?.toLowerCase();
    const action = args[2]?.toLowerCase();
    const user = message.mentions.users.first();

    if (group === 'exp') {
      if (action === 'setup') {
        if (!message.guild) return message.reply('❌ 這個指令只能在伺服器頻道使用。');
        const me = message.guild.members.me;
        if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return message.reply('❌ Bot 缺少「管理頻道」權限，無法自動建立 EXP 頻道。');
        }
        try {
          const existing = expRepo.getChannelSettings();
          let category = existing.categoryId ? message.guild.channels.cache.get(existing.categoryId) : null;
          if (!category || category.type !== ChannelType.GuildCategory) {
            category = await message.guild.channels.create({
              name: 'MSU 經驗追蹤',
              type: ChannelType.GuildCategory
            });
          }

          let countChannel = existing.countChannelId ? message.guild.channels.cache.get(existing.countChannelId) : null;
          if (!countChannel) {
            countChannel = await message.guild.channels.create({
              name: `📈｜經驗追蹤：${expRepo.countCharacters()}人`,
              type: ChannelType.GuildVoice,
              parent: category.id,
              permissionOverwrites: [{
                id: message.guild.roles.everyone.id,
                deny: [PermissionFlagsBits.Connect],
                allow: [PermissionFlagsBits.ViewChannel]
              }]
            });
          }

          let reportChannel = existing.reportChannelId ? message.guild.channels.cache.get(existing.reportChannelId) : null;
          if (!reportChannel) {
            reportChannel = await message.guild.channels.create({
              name: '每日練功概況',
              type: ChannelType.GuildText,
              parent: category.id,
              topic: '每天 08:20 抓取角色資料；若維修則每 30 分鐘補抓，完成後自動發布 EXP 與圈內排名。'
            });
          }

          expRepo.setSetting('categoryId', category.id);
          expRepo.setSetting('countChannelId', countChannel.id);
          expRepo.setSetting('reportChannelId', reportChannel.id);
          await updateCountChannel(message.client);
          return message.reply([
            '✅ EXP Tracker 頻道設定完成',
            `人數頻道：${countChannel}`,
            `每日報告：${reportChannel}`,
            '每天 08:20 執行；API 失敗時每 30 分鐘補抓，全部成功後自動推播。'
          ].join('\n'));
        } catch (error) {
          return message.reply(`❌ 建立頻道失敗：${error.message || error}`);
        }
      }
      if (action === 'add') {
        const input = args.slice(3).join(' ').trim();
        const progress = await message.reply(`⏳ 正在讀取 KnownChar：${input || '未指定角色'}…`);
        try {
          const resolved = resolveExpAddTarget(message, args);
          if (resolved.error) return progress.edit(`❌ ${resolved.error}`);
          if (resolved.candidates) return progress.edit(formatExpCandidates(resolved));

          const result = addTrackedCharacter(resolved.character);
          await progress.edit([
            `✅ 已加入經驗追蹤：${result.characterName}`,
            `KnownChar Key：${resolved.character.key || '—'}`,
            `assetKey：${result.assetKey}`,
            `目前追蹤：${expRepo.countCharacters()} 人`
          ].join('\n'));
          scheduleCountChannelUpdate(message.client);
          return;
        } catch (error) {
          return progress.edit(`❌ 新增失敗：${error.message || '未知錯誤'}`);
        }
      }
      if (action === 'find') {
        const input = args.slice(3).join(' ').trim();
        if (!input) return message.reply('格式：`>sudo exp find 角色名稱/別名`');
        const candidates = findKnownCharacterCandidates(input);
        return message.reply(candidates.length
          ? formatExpCandidates({ candidates: candidates.slice(0, 15), source: 'KnownChar' })
          : `❌ KnownChar 找不到「${input}」。請先使用 \`>knownchar add <角色名稱> [wallet]\`。`);
      }
      if (action === 'remove') {
        const assetKey = args[3];
        if (!assetKey) return message.reply('格式：`>sudo exp remove <assetKey>`');
        const removed = expRepo.removeCharacter(assetKey);
        const reply = await message.reply(removed ? `✅ 已停止追蹤：${assetKey}\n歷史資料仍保留。` : '❌ 找不到啟用中的追蹤角色。');
        if (removed) scheduleCountChannelUpdate(message.client);
        return reply;
      }
      if (action === 'list') {
        const rows = expRepo.listCharacters(true);
        return message.reply(rows.length ? [`## 📈 經驗追蹤名單（${rows.length}）`, ...rows.map((r,i)=>`${i+1}. **${r.characterName}**${r.jobName?`｜${r.jobName}`:''}\n   ${r.assetKey}`)].join('\n') : '目前沒有追蹤角色。');
      }
      if (action === 'snapshot') {
        const dateArg = args[3];
        const date = /^\d{4}-\d{2}-\d{2}$/.test(dateArg || '') ? dateArg : taipeiDate();
        const rows = expRepo.getSnapshots(date);
        if (!rows.length) return message.reply(`## 📸 ${date} Snapshot\n目前沒有快照資料。`);
        const lines = rows.slice(0, 20).map((row, index) => formatSnapshotLine(row, index + 1));
        const truncated = rows.length > 20 ? `\n\n其餘 ${rows.length - 20} 位未顯示。` : '';
        return message.reply([`## 📸 ${date} Snapshot（${rows.length}）`, ...lines].join('\n\n').slice(0, 1950) + truncated);
      }
      if (action === 'inspect') {
        const input = args.slice(3).join(' ').trim();
        if (!input) return message.reply('格式：`>sudo exp inspect <角色名稱／KnownChar key／assetKey>`');
        const resolved = resolveTrackedCharacter(input);
        if (resolved.error) return message.reply(`❌ ${resolved.error}`);
        if (resolved.candidates) return message.reply(formatExpCandidates({ candidates: resolved.candidates.slice(0, 15), source: '追蹤名單' }));
        const tracked = expRepo.getCharacter(resolved.character.assetKey);
        const latest = expRepo.getLatestSnapshot(tracked.assetKey);
        if (!latest) return message.reply(`## 🔎 ${tracked.characterName}\nassetKey：${tracked.assetKey}\n目前尚無 Snapshot。`);
        const previous = expRepo.getPreviousSnapshot(tracked.assetKey, latest.jobDate);
        return message.reply([
          `## 🔎 ${latest.characterName}｜EXP Inspect`,
          `assetKey：${latest.assetKey}`,
          `追蹤狀態：${tracked.enabled ? '✅ 啟用' : '⏸️ 停用'}`,
          '',
          formatSnapshotLine(latest),
          '',
          `前次資料：${previous ? `${previous.jobDate}｜Lv.${previous.level}｜${require('../services/expTracker/service').formatBigInt(previous.currentExp)} / ${require('../services/expTracker/service').formatBigInt(previous.requiredExp)}｜${require('../services/expTracker/service').formatExpRate(previous.expRate)}` : '無'}`,
          `原始欄位：currentExp=${latest.currentExp ?? 'null'}｜requiredExp=${latest.requiredExp ?? 'null'}｜expRate=${latest.expRate ?? 'null'}｜worldRank=${latest.worldRank ?? 'null'}`
        ].join('\n').slice(0, 1950));
      }
      if (action === 'repair') {
        const count = rebuildAllRankings();
        return message.reply(`✅ 已依正確 EXP 欄位重算 ${count} 天的圈內排名與每日增量。`);
      }
      if (action === 'db') {
        const stats = expRepo.getSnapshotStats();
        const today = taipeiDate();
        const job = expRepo.getJob(today);
        return message.reply([
          '## 🗄️ EXP Tracker 資料庫狀態',
          `啟用追蹤：${stats.tracked} 人`,
          `Snapshot 總筆數：${stats.snapshots}`,
          `有資料日期：${stats.dates} 天`,
          `全部 Pending：${stats.pending}`,
          `最新 Snapshot：${stats.latestDate || '無'}`,
          '',
          `今日任務：${job ? `${job.status}｜成功 ${job.successCount}/${job.totalCount}｜Pending ${job.pendingCount}` : '尚未建立'}`
        ].join('\n'));
      }
      if (action === 'status') {
        const date = taipeiDate();
        const job = expRepo.getJob(date);
        if (!job) return message.reply(`## 📈 ${date} 經驗追蹤\n今日任務尚未建立。`);
        const pending = expRepo.getPending(date);
        return message.reply([`## 📈 ${date} 經驗追蹤`,`狀態：${job.status}`,`成功：${job.successCount}/${job.totalCount}`,`等待重試：${job.pendingCount}`,pending.length?'':null,pending.length?'**Pending**':null,...pending.slice(0,15).map(r=>`• ${r.characterName}｜嘗試 ${r.attemptCount} 次｜${r.lastErrorCode||'等待首次查詢'}${r.nextRetryAt?`｜下次 ${new Date(r.nextRetryAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}`:''}`)].filter(Boolean).join('\n'));
      }
      if (action === 'preview') {
        const date = resolveReportDate(args[3]);
        if (!date) return message.reply('❌ 尚無 Snapshot，請先執行 `>sudo exp run`。');
        return message.reply({ content: `🧪 推播預覽（${date}，不會發到正式頻道）`, ...buildReport(date) });
      }
      if (action === 'testreport') {
        const date = resolveReportDate(args[3]);
        if (!date) return message.reply('❌ 尚無 Snapshot，請先執行 `>sudo exp run`。');
        try {
          const { channel, sent } = await sendTestReport(message, date);
          return message.reply(`✅ 測試推播完成：${channel}
日期：${date}
訊息：${sent.url}`);
        } catch (error) {
          return message.reply(`❌ 測試推播失敗：${error.message || error}`);
        }
      }
      if (action === 'countsync' || action === 'sync') {
        const progress = await message.reply('⏳ 正在同步經驗追蹤人數頻道…');
        try {
          const result = await updateCountChannel(message.client);
          return progress.edit([
            '✅ 人數頻道同步完成',
            `頻道：${result.channel}`,
            `名稱：${result.newName}`,
            `狀態：${result.changed ? '已更新' : '原本就是正確名稱'}`
          ].join('\n'));
        } catch (error) {
          console.error('[EXP][CountChannel] 手動同步失敗：', error.stack || error);
          return progress.edit([
            '❌ 人數頻道同步失敗',
            `原因：${error.message || error}`,
            '',
            `目前設定 ID：${process.env.EXP_COUNT_CHANNEL_ID || '未設定'}`
          ].join('\n'));
        }
      }
      if (action === 'run' || action === 'retry') {
        await message.reply(`⏳ 正在執行 ${action === 'retry' ? 'pending 補抓' : '今日經驗追蹤'}…`);
        const job = await runJob(message.client, taipeiDate());
        return message.channel.send(`✅ 執行完成：成功 ${job.successCount}/${job.totalCount}，Pending ${job.pendingCount}。`);
      }
      return message.reply('格式：`>sudo exp add/find/remove/list/status/snapshot/inspect/db/repair/run/retry/preview/testreport/countsync ...`');
    }

    if (group === 'pt') {
      if (action === 'list') {
        const parties = listUserParties('', true);
        return message.reply(parties.length ? ['## 🛡️ 全部有效 PT', ...parties.map((p,i)=>`${i+1}. **${p.name}**｜${p.memberCount} 人｜${p.partyId}`)].join('\n') : '目前沒有有效 PT。');
      }
      if (action === 'find') {
        if (!user) return message.reply('格式：`>sudo pt find @玩家`');
        const parties = findPartiesByDiscord(user.id);
        return message.reply(parties.length ? [`## 🔎 ${user.username} 的 PT`, ...parties.map(p=>`• ${p.name}｜${p.partyId}`)].join('\n') : `${user} 目前沒有有效 PT。`);
      }
      const target = args[3];
      const party = findParty(target);
      if (!party) return message.reply('❌ 找不到 PT。請使用隊伍名稱或 partyId。');
      if (action === 'view') return message.reply(formatParty(party));
      if (action === 'delete') {
        archivePartyV2(party.partyId);
        return message.reply(`✅ 已封存 PT：${party.name}`);
      }
      if (action === 'remove') {
        const assetKey = args[4];
        if (!assetKey) return message.reply('格式：`>sudo pt remove <隊伍名稱/partyId> <assetKey>`');
        try { removePartyMemberV2(party.partyId, assetKey); return message.reply(`✅ 已移除角色：${assetKey}`); }
        catch (e) { return message.reply(`❌ ${e.message}`); }
      }
      if (action === 'leader') {
        const assetKey = args[4];
        if (!assetKey) return message.reply('格式：`>sudo pt leader <隊伍名稱/partyId> <assetKey>`');
        try { transferPartyLeader(party.partyId, assetKey); return message.reply(`✅ 已轉讓隊長：${assetKey}`); }
        catch (e) { return message.reply(`❌ ${e.message}`); }
      }
      if (action === 'edit') {
        const field = args[4]?.toLowerCase();
        const value = args.slice(5).join(' ').trim();
        if (!['name','boss','difficulty'].includes(field) || !value) return message.reply('格式：`>sudo pt edit <隊伍> name/boss/difficulty <新值>`');
        const changes = field === 'name' ? {name:value} : field === 'boss' ? {bossId:value} : {difficulty:value};
        try { updatePartyV2(party.partyId, changes); return message.reply(`✅ 已修改 ${field}；Boss／難度變更時 Layer 已清空。`); }
        catch (e) { return message.reply(`❌ ${e.message}`); }
      }
      return message.reply('格式：`>sudo pt list/view/find/remove/leader/delete/edit ...`\n新增 Discord／knownchar 建議從 `>msuME → 我的隊伍` 操作。');
    }

    if (group !== 'bind') return message.reply('格式：`>sudo bind ...`、`>sudo pt ...` 或 `>sudo exp ...`');
    if (!user) return message.reply('❌ 請標記 Discord 使用者。');
    if (action === 'list') {
      const binding = getBinding(user.id);
      return message.reply(binding ? formatBinding(user, binding) : `${user} 尚未綁定任何資料。`);
    }
    if (action === 'delete-all') {
      const removed = removeBinding(user.id);
      return message.reply(removed ? `✅ 已解除 ${user} 的全部綁定資料。` : `❌ ${user} 沒有綁定資料。`);
    }
    if (action === 'delete') {
      const targetText = args.slice(3).filter(arg => !/^<@!?\d+>$/.test(arg)).join(' ').trim();
      if (!targetText) return message.reply('格式：`>sudo bind delete @使用者 角色名稱/別名/assetKey`');
      const { updated, removed } = removeCharacter(user.id, targetText);
      if (!updated) return message.reply(`❌ ${user} 沒有綁定資料。`);
      if (!removed) return message.reply(`❌ 找不到「${targetText}」。\n\n${formatBinding(user, updated)}`);
      return message.reply(`✅ 已解除單一角色綁定\n使用者：${user}\n角色：${removed.characterName}\n別名：${removed.alias || '未設定'}\nassetKey：${removed.assetKey}`);
    }
    return message.reply('格式：`>sudo bind list/delete/delete-all @使用者 [角色]`');
  }
};
