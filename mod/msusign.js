const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'msusign.json');
const TIME_ZONE = 'Asia/Taipei';

const DEFAULT_DATA = {
  guilds: {}
};

let timer = null;
let isChecking = false;

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
  }
}

function loadData() {
  ensureDataFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return structuredClone(DEFAULT_DATA);
    if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
    return parsed;
  } catch (error) {
    console.error('[MSUSIGN] 讀取資料失敗，使用空白資料：', error.message);
    return structuredClone(DEFAULT_DATA);
  }
}

function saveData(data) {
  ensureDataFile();
  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempFile, DATA_FILE);
}

function getGuildConfig(data, guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      enabled: false,
      channelId: null,
      userIds: [],
      lastSent: {}
    };
  }

  const config = data.guilds[guildId];
  if (!Array.isArray(config.userIds)) config.userIds = [];
  if (!config.lastSent || typeof config.lastSent !== 'object') config.lastSent = {};
  return config;
}

function getTaipeiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const values = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function buildReminder(userIds, stage) {
  const mentions = userIds.map(userId => `<@${userId}>`).join(' ');

  const messages = {
    '21:00': '提醒你們，簽到很容易忘記，記得簽到。',
    '23:00': '再次提醒你們，簽到真的很容易忘記，記得簽到。',
    '00:00': '12點了，最後提醒你們一次！如果這次再沒簽到，你們就少一天了。'
  };

  return `${mentions}\n\n${messages[stage]}`;
}

async function sendReminder(client, guildId, config, stage) {
  if (!config.channelId || config.userIds.length === 0) return false;

  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') {
    console.error(`[MSUSIGN] 找不到可發送的頻道：guild=${guildId}, channel=${config.channelId}`);
    return false;
  }

  await channel.send({
    content: buildReminder(config.userIds, stage),
    allowedMentions: {
      parse: [],
      users: config.userIds
    }
  });

  console.log(`[MSUSIGN] 已發送 ${stage} 簽到提醒：guild=${guildId}, users=${config.userIds.length}`);
  return true;
}

async function checkSchedules(client) {
  if (isChecking) return;
  isChecking = true;

  try {
    const now = getTaipeiParts();
    let stage = null;

    if (now.hour === 21 && now.minute === 0) stage = '21:00';
    if (now.hour === 23 && now.minute === 0) stage = '23:00';
    if (now.hour === 0 && now.minute === 0) stage = '00:00';
    if (!stage) return;

    const data = loadData();
    let changed = false;

    for (const [guildId, config] of Object.entries(data.guilds)) {
      if (!config.enabled) continue;

      const sentKey = `${now.dateKey}|${stage}`;
      if (config.lastSent?.[stage] === sentKey) continue;

      try {
        const sent = await sendReminder(client, guildId, config, stage);
        if (sent) {
          config.lastSent[stage] = sentKey;
          changed = true;
        }
      } catch (error) {
        console.error(`[MSUSIGN] 發送 ${stage} 提醒失敗：`, error.stack || error);
      }
    }

    if (changed) saveData(data);
  } finally {
    isChecking = false;
  }
}

function start(client) {
  if (timer) return;

  ensureDataFile();
  checkSchedules(client).catch(error => {
    console.error('[MSUSIGN] 初次排程檢查失敗：', error.stack || error);
  });

  timer = setInterval(() => {
    checkSchedules(client).catch(error => {
      console.error('[MSUSIGN] 排程檢查失敗：', error.stack || error);
    });
  }, 30 * 1000);

  timer.unref?.();
  console.log('[MSUSIGN] 定時簽到提醒已啟動（Asia/Taipei：21:00、23:00、00:00）');
}

function isOwner(message) {
  return Boolean(process.env.OWNER_ID) && message.author.id === process.env.OWNER_ID;
}

function getMentionedUserIds(message, args) {
  const ids = new Set(message.mentions.users.map(user => user.id));

  for (const arg of args) {
    const match = arg.match(/^<@!?(\d+)>$/) || arg.match(/^(\d{15,25})$/);
    if (match) ids.add(match[1]);
  }

  return [...ids];
}

function helpText() {
  return [
    '## ⏰ MSU 簽到提醒指令',
    '`>msusign channel`－將目前頻道設為提醒頻道',
    '`>msusign add @人 [@人...]`－加入提醒名單',
    '`>msusign remove @人 [@人...]`－移除提醒名單',
    '`>msusign list`－查看提醒名單',
    '`>msusign on`－開啟每日提醒',
    '`>msusign off`－關閉每日提醒',
    '`>msusign status`－查看目前設定',
    '`>msusign test 21|23|00`－測試合併提醒訊息',
    '',
    '固定提醒時間：台灣時間 21:00、23:00、00:00。'
  ].join('\n');
}

async function execute(message, args) {
  if (!message.guild) return message.reply('❌ 這個指令只能在伺服器內使用。');

  const subcommand = args[1]?.toLowerCase() || 'help';
  const data = loadData();
  const config = getGuildConfig(data, message.guild.id);

  if (subcommand === 'help') {
    return message.reply(helpText());
  }

  if (!isOwner(message)) {
    return message.reply('❌ 只有 Bot 擁有者可以設定簽到提醒。');
  }

  if (subcommand === 'channel') {
    config.channelId = message.channel.id;
    saveData(data);
    return message.reply(`✅ 已將此頻道設為簽到提醒頻道：<#${message.channel.id}>`);
  }

  if (subcommand === 'add') {
    const userIds = getMentionedUserIds(message, args.slice(2));
    if (userIds.length === 0) {
      return message.reply('❌ 請標記至少一位使用者，例如：`>msusign add @夜夜 @Ponda`');
    }

    const before = new Set(config.userIds);
    userIds.forEach(userId => before.add(userId));
    const addedCount = before.size - config.userIds.length;
    config.userIds = [...before];
    saveData(data);

    return message.reply(`✅ 已新增 ${addedCount} 位，目前提醒名單共 ${config.userIds.length} 位。`);
  }

  if (subcommand === 'remove' || subcommand === 'delete') {
    const userIds = getMentionedUserIds(message, args.slice(2));
    if (userIds.length === 0) {
      return message.reply('❌ 請標記要移除的使用者，例如：`>msusign remove @夜夜`');
    }

    const removeSet = new Set(userIds);
    const oldLength = config.userIds.length;
    config.userIds = config.userIds.filter(userId => !removeSet.has(userId));
    saveData(data);

    return message.reply(`✅ 已移除 ${oldLength - config.userIds.length} 位，目前提醒名單共 ${config.userIds.length} 位。`);
  }

  if (subcommand === 'list') {
    if (config.userIds.length === 0) return message.reply('📭 目前簽到提醒名單是空的。');

    const list = config.userIds.map((userId, index) => `${index + 1}. <@${userId}>`).join('\n');
    return message.reply({
      content: `## 📋 MSU 簽到提醒名單\n${list}`,
      allowedMentions: { parse: [] }
    });
  }

  if (subcommand === 'on') {
    if (!config.channelId) {
      return message.reply('❌ 請先在指定頻道輸入：`>msusign channel`');
    }
    if (config.userIds.length === 0) {
      return message.reply('❌ 提醒名單是空的，請先使用：`>msusign add @人`');
    }

    config.enabled = true;
    saveData(data);
    return message.reply('✅ 已開啟簽到提醒，每天台灣時間 21:00、23:00、00:00 發送。');
  }

  if (subcommand === 'off') {
    config.enabled = false;
    saveData(data);
    return message.reply('⏸️ 已關閉簽到提醒，設定與名單仍會保留。');
  }

  if (subcommand === 'status') {
    const users = config.userIds.length > 0
      ? config.userIds.map(userId => `<@${userId}>`).join(' ')
      : '尚未設定';

    return message.reply({
      content: [
        '## ⚙️ MSU 簽到提醒狀態',
        `狀態：${config.enabled ? '✅ 已開啟' : '⏸️ 已關閉'}`,
        `頻道：${config.channelId ? `<#${config.channelId}>` : '尚未設定'}`,
        `人數：${config.userIds.length}`,
        `名單：${users}`,
        '時間：21:00、23:00、00:00（Asia/Taipei）'
      ].join('\n'),
      allowedMentions: { parse: [] }
    });
  }

  if (subcommand === 'test') {
    if (config.userIds.length === 0) {
      return message.reply('❌ 提醒名單是空的，請先使用：`>msusign add @人`');
    }

    const stageInput = args[2]?.toLowerCase() || '21';
    const stageMap = {
      '21': '21:00',
      '21:00': '21:00',
      '23': '23:00',
      '23:00': '23:00',
      '0': '00:00',
      '00': '00:00',
      '00:00': '00:00',
      '12': '00:00'
    };
    const stage = stageMap[stageInput];

    if (!stage) return message.reply('❌ 測試時段請輸入：`21`、`23` 或 `00`。');

    return message.channel.send({
      content: buildReminder(config.userIds, stage),
      allowedMentions: {
        parse: [],
        users: config.userIds
      }
    });
  }

  return message.reply(helpText());
}

module.exports = {
  execute,
  start,
  checkSchedules
};
