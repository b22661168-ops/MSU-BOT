'use strict';
const { getCharacterDetail } = require('../msuApi');
const repo = require('./repository');
const { mapCharacterProgress } = require('./fieldMapper');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function taipeiDate(date = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
function formatBigInt(value) {
  if (value == null) return '—';
  const number = BigInt(value); const abs = number < 0n ? -number : number;
  const units=[[1000000000000n,'T'],[1000000000n,'B'],[1000000n,'M'],[1000n,'K']];
  for (const [divisor,label] of units) if (abs>=divisor) return `${Number(number*10n/divisor)/10}${label}`;
  return number.toLocaleString('en-US');
}
function formatExpRate(value) { return value == null ? '—' : `${Number(value).toFixed(3).replace(/0+$/,'').replace(/\.$/,'')}%`; }
function getErrorInfo(error) {
  const data=error?.response?.data;
  return { code:data?.error?.name||data?.error?.code||error?.code||'API_ERROR', message:data?.error?.message||error?.message||'Unknown API error' };
}
let countChannelUpdateTimer = null;
let pendingCountChannelClient = null;

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function updateCountChannel(client) {
  // 現在以 .env 為唯一優先來源；舊設定只保留相容 fallback。
  const channelId = String(
    process.env.EXP_COUNT_CHANNEL_ID ||
    repo.getSetting('countChannelId') ||
    process.env.EXP_TRACKER_COUNT_CHANNEL_ID ||
    ''
  ).trim();

  if (!channelId) {
    throw new Error('未設定 EXP_COUNT_CHANNEL_ID。');
  }
  if (!client?.channels?.fetch) {
    throw new Error('Discord Client 尚未準備完成。');
  }

  console.log(`[EXP][CountChannel] 開始同步，channelId=${channelId}`);

  const channel = await withTimeout(
    client.channels.fetch(channelId, { force: true }),
    10000,
    `讀取人數頻道逾時（10 秒）：${channelId}`
  );

  if (!channel) {
    throw new Error(`找不到人數頻道：${channelId}`);
  }
  if (typeof channel.setName !== 'function') {
    throw new Error(`指定目標不是可改名的 Discord 頻道：${channelId}`);
  }

  const me = channel.guild?.members?.me;
  if (me && !channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error(`Bot 在「${channel.name}」沒有「管理頻道」權限。`);
  }

  const count = repo.countCharacters();
  const oldName = channel.name;
  const newName = `📈｜經驗追蹤：${count}人`;

  if (oldName === newName) {
    console.log(`[EXP][CountChannel] 無須更新：${newName}`);
    return { channelId, channel, count, oldName, newName, changed: false };
  }

  await withTimeout(
    channel.setName(newName, `同步 EXP Tracker 人數：${count}`),
    15000,
    'Discord 頻道改名逾時（15 秒），可能正在受到頻率限制。'
  );

  console.log(`[EXP][CountChannel] 更新成功：${oldName} -> ${newName}`);
  return { channelId, channel, count, oldName, newName, changed: true };
}

// Discord 對頻道改名有頻率限制。新增／移除角色時先完成指令回覆，
// 再將短時間內的多次人數變更合併成一次頻道改名。
function scheduleCountChannelUpdate(client, delayMs = 5000) {
  pendingCountChannelClient = client || pendingCountChannelClient;
  if (countChannelUpdateTimer) clearTimeout(countChannelUpdateTimer);
  countChannelUpdateTimer = setTimeout(() => {
    const targetClient = pendingCountChannelClient;
    countChannelUpdateTimer = null;
    pendingCountChannelClient = null;
    if (targetClient) {
      void updateCountChannel(targetClient).catch(error => {
        console.error('[EXP][CountChannel] 背景同步失敗：', error.stack || error);
      });
    }
  }, delayMs);
  countChannelUpdateTimer.unref?.();
}
function addTrackedCharacter(character) {
  if (!character?.assetKey || !character?.characterName) {
    throw new Error('KnownChar 資料缺少 characterName 或 assetKey。');
  }
  return repo.addCharacter({
    assetKey: character.assetKey,
    characterName: character.characterName,
    jobName: character.jobName || null
  });
}
async function runJob(client, jobDate=taipeiDate()) {
  const job=repo.ensureDailyJob(jobDate); if(job.status==='COMPLETED') return job;
  const pending=repo.getPending(jobDate).filter(item=>!item.nextRetryAt||item.nextRetryAt<=new Date().toISOString());
  for(const item of pending){
    try {
      const raw=await getCharacterDetail(item.assetKey); const mapped=mapCharacterProgress(raw,item.assetKey);
      if(!mapped.valid) throw Object.assign(new Error(mapped.errors.join('、')),{code:'INVALID_FIELDS'});
      repo.saveSuccess(jobDate,mapped,JSON.stringify(raw));
    } catch(error){ repo.markAttemptFailure(jobDate,item.assetKey,getErrorInfo(error)); }
    await sleep(650);
  }
  return tryFinalize(client,jobDate);
}

// 同等級：今天目前 EXP - 昨天目前 EXP
// 升 1 級：昨天剩餘 EXP + 今天目前 EXP
// 跨越 2 級以上時，API 沒有提供中間每級需求，避免亂算而回傳 null。
function calculateGainedExp(current, previous) {
  if (!previous || current.currentExp == null || previous.currentExp == null) return null;
  const levelDelta = Number(current.level) - Number(previous.level);
  if (levelDelta === 0) return (BigInt(current.currentExp) - BigInt(previous.currentExp)).toString();
  if (levelDelta === 1 && previous.requiredExp != null) {
    return ((BigInt(previous.requiredExp) - BigInt(previous.currentExp)) + BigInt(current.currentExp)).toString();
  }
  return null;
}

function calculateRankings(jobDate) {
  const snapshots=repo.getSnapshots(jobDate);
  snapshots.sort((a,b)=>b.level-a.level || compareCurrentExp(b,a));
  const db=require('../db');
  const update=db.prepare(`UPDATE exp_tracker_snapshots SET localRank=?,localRankChange=?,worldRankChange=?,gainedExp=? WHERE jobDate=? AND assetKey=?`);
  db.transaction(()=>snapshots.forEach((row,index)=>{
    const previous=repo.getPreviousSnapshot(row.assetKey,jobDate);
    const gained=calculateGainedExp(row,previous);
    const localChange=previous?.localRank ? previous.localRank-(index+1) : null;
    const worldChange=previous?.worldRank&&row.worldRank ? previous.worldRank-row.worldRank : null;
    update.run(index+1,localChange,worldChange,gained,jobDate,row.assetKey);
  }))();
}
function compareCurrentExp(a,b){ const av=BigInt(a.currentExp??'0'),bv=BigInt(b.currentExp??'0'); return av>bv?1:av<bv?-1:0; }
function compareGained(a,b){ const av=BigInt(a.gainedExp??'0'),bv=BigInt(b.gainedExp??'0'); return av>bv?1:av<bv?-1:0; }
function arrow(change){ if(change==null||change===0)return '—'; return change>0?`▲${change}`:`▼${Math.abs(change)}`; }
function getReportRows(jobDate) {
  return repo.getSnapshots(jobDate)
    .filter(row => row.gainedExp != null)
    .sort((a, b) => compareGained(b, a));
}

function formatSignedExp(value) {
  if (value == null) return '首次記錄';
  const n = BigInt(value);
  return `${n >= 0n ? '+' : ''}${formatBigInt(value)}`;
}

function buildReportPage(jobDate, page = 0) {
  const allSnapshots = repo.getSnapshots(jobDate);
  const rankedRows = getReportRows(jobDate);
  const sourceRows = rankedRows.length ? rankedRows : allSnapshots;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(sourceRows.length / pageSize));
  const safePage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  const rows = sourceRows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const best = rankedRows[0] || null;
  const latestCapturedAt = allSnapshots.reduce((latest, row) => {
    if (!row.capturedAt) return latest;
    return !latest || row.capturedAt > latest ? row.capturedAt : latest;
  }, null);
  const updatedTime = latestCapturedAt
    ? new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).format(new Date(latestCapturedAt))
    : jobDate;

  const lines = rows.length
    ? rows.map((row, index) => {
        const rank = safePage * pageSize + index + 1;
        return `**${rank}. ${row.characterName}**｜Lv.${row.level}｜${formatSignedExp(row.gainedExp)}（${formatExpRate(row.expRate)}）`;
      })
    : ['目前沒有可顯示的角色資料。'];

  const description = [
    ...lines,
    ...(safePage === 0 ? [
      '',
      '**🏆 最佳練功者**',
      best ? `${best.characterName}｜${formatSignedExp(best.gainedExp)} EXP` : '資料累積中',
      '',
      `🕒 更新時間：${updatedTime}`
    ] : [])
  ].join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`📈 EXP 排行｜${jobDate}`)
    .setDescription(description)
    .setFooter({ text: `第 ${safePage + 1} / ${totalPages} 頁` });

  const components = [];
  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`exp_report|${jobDate}|${safePage - 1}`)
        .setLabel('上一頁')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`exp_report|${jobDate}|${safePage + 1}`)
        .setLabel('下一頁')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1)
    ));
  }

  return { embeds: [embed], components };
}

function buildReport(jobDate) {
  return buildReportPage(jobDate, 0);
}

async function handleReportInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('exp_report|')) return false;
  const [, jobDate, pageRaw] = interaction.customId.split('|');
  await interaction.update(buildReportPage(jobDate, Number(pageRaw) || 0));
  return true;
}

function rebuildAllRankings() {
  const dates = repo.listSnapshotDates();
  for (const date of dates) calculateRankings(date);
  return dates.length;
}
async function tryFinalize(client,jobDate){ const job=repo.getJob(jobDate); if(!job||job.pendingCount>0||job.status==='COMPLETED') return job; calculateRankings(jobDate); let messageId=null; const channelId=process.env.EXP_REPORT_CHANNEL_ID || repo.getSetting('reportChannelId') || process.env.EXP_TRACKER_REPORT_CHANNEL_ID; if(channelId){ try{const channel=await client.channels.fetch(channelId); const message=await channel.send(buildReport(jobDate)); messageId=message.id;}catch(error){console.error('[EXP] 發送報告失敗:',error.message||error);} } repo.finalizeJob(jobDate,messageId); await updateCountChannel(client); return repo.getJob(jobDate); }
module.exports={taipeiDate,addTrackedCharacter,runJob,tryFinalize,updateCountChannel,scheduleCountChannelUpdate,buildReport,buildReportPage,handleReportInteraction,formatBigInt,formatExpRate,calculateGainedExp,rebuildAllRankings};
