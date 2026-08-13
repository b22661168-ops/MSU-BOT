const path = require('path');
const { AttachmentBuilder } = require('discord.js');

module.exports = {
  name: 'arc6',

  async execute(message) {
    const imagePath = path.join(__dirname, '..', 'images', 'arc', 'arc6.png');
    const attachment = new AttachmentBuilder(imagePath, { name: 'arc6.png' });

    return message.channel.send({
      files: [attachment]
    });
  }
};
