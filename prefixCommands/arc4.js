const path = require('path');
const { AttachmentBuilder } = require('discord.js');

module.exports = {
  name: 'arc4',

  async execute(message) {
    const imagePath = path.join(__dirname, '..', 'images', 'arc', 'arc4.png');
    const attachment = new AttachmentBuilder(imagePath, { name: 'arc4.png' });

    return message.channel.send({
      files: [attachment]
    });
  }
};
