const fs = require('fs');
const path = require('path');

const itemFile = path.join(__dirname, '../data/itemNames.json');

module.exports = {
  name: 'item',

  async execute(message, args) {
    const itemId = args[1];
    const itemName = args.slice(2).join(' ');

    if (!itemId || !itemName) {
      return message.reply(
        '用法：>item 2358005 核心寶石'
      );
    }

    const data = JSON.parse(
      fs.readFileSync(itemFile, 'utf8')
    );

    data[itemId] = itemName;

    fs.writeFileSync(
      itemFile,
      JSON.stringify(data, null, 2),
      'utf8'
    );

    return message.reply(
      `✅ 神奇的魔法產生了 現在我記得了 Item\n${itemId} → ${itemName}`
    );
  }
};