const { parseFarmMessage } = require('../parser/farmParser');
const {
  getTodayString,
  saveFarmResult
} = require('../repository/farmRepository');

const NONO_BOT_ID = process.env.NONO_BOT_ID;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scanFarm(message, farmKey) {
  if (!NONO_BOT_ID) {
    throw new Error('請先在 .env 設定 NONO_BOT_ID');
  }

  await message.channel.send(`>farm ${farmKey}`);

  const collected = await message.channel.awaitMessages({
    filter: reply => {
      if (reply.author.id !== NONO_BOT_ID) return false;

      const text = reply.content || '';
      return text.includes(`${farmKey} 的魔法農場`) || text.includes('的魔法農場');
    },
    max: 1,
    time: 15000,
    errors: ['time']
  });

  const farmMessage = collected.first();
  const rawText = farmMessage.content;

  const parsed = parseFarmMessage(rawText);

  saveFarmResult({
    scanDate: getTodayString(),
    farmKey,
    parsed
  });

  await sleep(1000);

  return parsed;
}

module.exports = {
  scanFarm
};