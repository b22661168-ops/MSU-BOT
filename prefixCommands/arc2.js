const path = require('path');
const { AttachmentBuilder } = require('discord.js');

module.exports = {
  name: 'arc2',

  async execute(message) {
    const imagePath = path.join(__dirname, '..', 'images', 'arc', 'arc2.jpg');
    const attachment = new AttachmentBuilder(imagePath, { name: 'arc2.jpg' });

    return message.channel.send({
      files: [attachment]
    });
  }
};
