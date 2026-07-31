const fs = require('fs');
const path = require('path');

const rewardFile = path.join(
  __dirname,
  '../data/rewardValues.json'
);

module.exports = {
  name: 'reward',

  async execute(message, args) {
    const layerId = args[1];
    const rewardType = args[2];
    const rewardValue = args.slice(3).join(' ');

    if (!layerId || !rewardType || !rewardValue) {
      return message.reply(
        '用法：\n' +
        '>reward 205018 small 20K\n' +
        '>reward 205018 big 127K\n' +
        '>reward 308057 normal 215K'
      );
    }

    const data = JSON.parse(
      fs.readFileSync(rewardFile, 'utf8')
    );

    if (!data[layerId]) {
      data[layerId] = {};
    }

    data[layerId][rewardType] = rewardValue;

    fs.writeFileSync(
      rewardFile,
      JSON.stringify(data, null, 2),
      'utf8'
    );

    return message.reply(
      `✅ 大小錢資料已維護進去 謝謝主人 我又更強大了\n` +
      `Layer ${layerId}\n` +
      `${rewardType} → ${rewardValue}`
    );
  }
};