require('dotenv').config({ quiet: true });

const topCommand = require('./slashCommands/top');

const ptCommand = require('./prefixCommands/pt');
const walletsCommand = require('./prefixCommands/wallets');
const raffleCommand = require('./prefixCommands/raffle');
const debugCommand = require('./prefixCommands/debug');
const epCommand = require('./prefixCommands/ep');
const pondaCommand = require('./prefixCommands/ponda');
const bindCommand = require('./prefixCommands/bind');
const charsCommand = require('./prefixCommands/chars');
const raffleDebugCommand = require('./prefixCommands/raffleDebug');
const itemCommand = require('./prefixCommands/item');
const layerCommand = require('./prefixCommands/layer');
const rewardCommand = require('./prefixCommands/reward');
const datahelpCommand = require('./prefixCommands/datahelp');
const charactersCommand = require('./prefixCommands/characters');
const raffleHistoryCommand = require('./prefixCommands/raffleHistory');
const raffleHistorySummaryCommand = require('./prefixCommands/raffleHistorySummary');
const helpCommand = require('./prefixCommands/help');
const knowncharCommand = require('./prefixCommands/knownchar');
const splitCommand = require('./prefixCommands/split');
const lickCommand = require('./prefixCommands/lick');
const msuMECommand = require('./prefixCommands/msuME');
const farmCommand = require('./prefixCommands/farm');
const burnCommand = require('./prefixCommands/burn');
const sudoCommand = require('./prefixCommands/sudo');
const sudohelpCommand = require('./prefixCommands/sudohelp');
const arc2Command = require('./prefixCommands/arc2');
const arc3Command = require('./prefixCommands/arc3');
const arc4Command = require('./prefixCommands/arc4');
const arc6Command = require('./prefixCommands/arc6');
const msusignCommand = require('./mod/msusign');

const { loadBindings } = require('./services/bindingService');
const { startSchedulers } = require('./services/scheduler');

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const {
  getCharactersByWallet,
  getCharacterDetail
} = require('./services/msuApi');

const { generateCharacterCard } = require('./utils/cardImageGenerator');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const commands = [
  topCommand.data,

  new SlashCommandBuilder()
    .setName('mychars')
    .setDescription('查詢錢包底下的 MSU 角色')
    .addStringOption(option =>
      option.setName('wallet')
        .setDescription('你的錢包地址，例如 0x...')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('char')
    .setDescription('用 assetKey 查詢單一角色詳細資料')
    .addStringOption(option =>
      option.setName('assetkey')
        .setDescription('角色 assetKey，例如 CHARxxxxx')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('msu名片')
    .setDescription('產生已綁定角色的 MSU 名片')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('要查詢的 Discord 使用者；不填則查自己')
        .setRequired(false)
    )
].map(command => command.toJSON());

client.once('clientReady', async () => {
  console.log(`✅ 已登入：${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
    { body: commands }
  );

  console.log('✅ Slash 指令已註冊');

  startSchedulers(client);
  msusignCommand.start(client);
});

client.on('interactionCreate', async interaction => {
  if (interaction.isButton() && interaction.customId?.startsWith('exp_report|')) {
    try {
      const { handleReportInteraction } = require('./services/expTracker/service');
      await handleReportInteraction(interaction);
    } catch (error) {
      console.error('[EXP] 報告分頁失敗:', error.stack || error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ 無法切換 EXP 排行頁面。', ephemeral: true }).catch(() => {});
      }
    }
    return;
  }
  if (
    (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) &&
    interaction.customId?.startsWith('msume_')
  ) {
    try {
      await msuMECommand.handleInteraction(interaction);
    } catch (error) {
      console.error('===== UNHANDLED MSUME ERROR =====');
      console.error(error.stack || error.message || error);

      const payload = {
        content: '❌ 玩家中心發生未預期錯誤，請稍後再試。',
        components: []
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === topCommand.data.name) {
    try {
      await topCommand.execute(interaction);
    } catch (error) {
      console.error('[頂樓傳送門] 執行失敗:', error.stack || error);
      const payload = { content: '❌ 無法建立頂樓傳送門。', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
    return;
  }

  if (interaction.commandName === 'mychars') {
    const wallet = interaction.options.getString('wallet');

    await interaction.deferReply();

    try {
      const characters = await getCharactersByWallet(wallet);

      if (characters.length === 0) {
        await interaction.editReply('查不到角色，可能錢包地址不對，或這個錢包沒有角色。');
        return;
      }

      const text = characters.map((c, index) => {
        return `${index + 1}. ${c.name || '未知名稱'}\nassetKey: ${c.assetKey || '沒有 assetKey'}`;
      }).join('\n\n');

      await interaction.editReply(`查詢成功 ✅\n\n${text}`);
    } catch (error) {
      console.error(error.response?.data || error.message);
      await interaction.editReply('查詢 MSU API 失敗，請看終端機錯誤訊息。');
    }
  }

  if (interaction.commandName === 'char') {
    const assetKey = interaction.options.getString('assetkey');

    await interaction.deferReply();

    try {
      const character = await getCharacterDetail(assetKey);
      const card = await generateCharacterCard(character);

      await interaction.editReply({
        files: [card]
      });
    } catch (error) {
      console.error(error.response?.data || error.message);
      await interaction.editReply('查詢角色詳細資料失敗，請看終端機錯誤訊息。');
    }
  }

  if (interaction.commandName === 'msu名片') {
    const user = interaction.options.getUser('user') || interaction.user;

    await interaction.deferReply();

    try {
      const bindings = loadBindings();
      const bind = bindings[user.id];

      if (!bind) {
        await interaction.editReply(
          `${user} 還沒有綁定角色。\n請先使用：>bind @人 錢包地址 角色名稱`
        );
        return;
      }

      const boundCharacters = Array.isArray(bind.characters) ? bind.characters : [];
      const main = boundCharacters.find(character => character.isDefault) || boundCharacters[0];
      const assetKey = main?.assetKey || bind.assetKey;
      if (!assetKey) {
        await interaction.editReply('找不到可用的綁定角色。');
        return;
      }
      const character = await getCharacterDetail(assetKey);
      const card = await generateCharacterCard(character);

      await interaction.editReply({
        files: [card]
      });
    } catch (error) {
      console.error(error.response?.data || error.message);
      await interaction.editReply('產生 MSU 名片失敗，請看終端機錯誤訊息。');
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('>')) return;

  const args = message.content.slice(1).trim().split(/\s+/);
  const command = args[0].toLowerCase();

  const ptSubCommand = args[1]?.toLowerCase();
  const ptAction = args[3]?.toLowerCase();

  const isPtWriteCommand =
    ptSubCommand === 'delete' ||
    ptSubCommand === 'weight' ||
    ptAction === 'add' ||
    ptAction === 'remove';

  if (
    command === 'pt' &&
    isPtWriteCommand &&
    message.author.id !== process.env.OWNER_ID
  ) {
    return message.reply('❌ 你不怕你綁錯人嗎?._.。');
  }

  const OWNER_ONLY_COMMANDS = [
    'debug',
    'bind',
    'raffle-debug',
    'wallets',
    'msuitem',
    'layer',
    'knownchar',
    'sudo',
    'sudohelp',
    'ep'
  ];

  if (
    OWNER_ONLY_COMMANDS.includes(command) &&
    message.author.id !== process.env.OWNER_ID
  ) {
    if (command === 'sudo' || command === 'sudohelp') return;
    return message.reply('❌ 你覺得你有權限可以用嗎._.?。');
  }

  const prefixCommands = {
    ponda: pondaCommand,
    debug: debugCommand,
    ep: epCommand,
    bind: bindCommand,
    wallets: walletsCommand,
    'raffle-debug': raffleDebugCommand,
    chars: charsCommand,
    raffle: raffleCommand,
    msuitem: itemCommand,
    layer: layerCommand,
    reward: rewardCommand,
    datahelp: datahelpCommand,
    characters: charactersCommand,
    pt: ptCommand,
    knownchar: knowncharCommand,
    msuhelp: helpCommand,
    split: splitCommand,
    lick: lickCommand,
    msume: msuMECommand,
    sudo: sudoCommand,
    sudohelp: sudohelpCommand,
    msusign: msusignCommand,
    burn: burnCommand,
    arc2: arc2Command,
    arc3: arc3Command,
    arc4: arc4Command,
    arc6: arc6Command
  };

  if (
    command === 'raffle' &&
    args[1]?.toLowerCase() === 'history' &&
    args[2]?.toLowerCase() === 'summary'
  ) {
    return raffleHistorySummaryCommand.execute(message, args.slice(3));
  }

  if (command === 'raffle' && args[1]?.toLowerCase() === 'history') {
    return raffleHistoryCommand.execute(message, args.slice(2));
  }

  if (command === '今日農場') {
    return farmCommand.execute(message, ['今日']);
  }
  
  if (command.startsWith('農場')) {
    const farmArgs = [];
  
    const subFromCommand = command.replace('農場', '');
  
    if (subFromCommand) farmArgs.push(subFromCommand);
    farmArgs.push(...args.slice(1));
  
    return farmCommand.execute(message, farmArgs);
  }

  if (prefixCommands[command]) {
    return prefixCommands[command].execute(message, args);
  }
});

client.login(process.env.DISCORD_TOKEN);