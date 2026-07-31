const fs = require('fs');
const path = require('path');

const layerFile = path.join(
  __dirname,
  '../data/layerNames.json'
);

module.exports = {
  name: 'layer',

  async execute(message, args) {
    const layerId = args[1];
    const layerName = args.slice(2).join(' ');

    if (!layerId || !layerName) {
      return message.reply(
        '用法：>layer 205038 普通獅子抽獎'
      );
    }

    const data = JSON.parse(
      fs.readFileSync(layerFile, 'utf8')
    );

    data[layerId] = layerName;

    fs.writeFileSync(
      layerFile,
      JSON.stringify(data, null, 2),
      'utf8'
    );

    return message.reply(
      `✅ 神奇的魔法產生了 現在我認識了\n${layerId} → ${layerName} 謝謝你 主人`
    );
  }
};