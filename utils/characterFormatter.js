const { EmbedBuilder } = require('discord.js');
const { getJobInfo } = require('./jobInfo');

const ARCANE_NAMES = [
  '消逝的旅途',
  '啾啾島',
  '拉契爾恩',
  '阿爾卡娜',
  '魔菈斯',
  '艾斯佩拉'
];

function formatCharacter(character) {
  const common = character.common;
  const stat = character.apStat;

  const jobInfo = getJobInfo(common.job.jobName, stat);
  const mainStatValue = stat[jobInfo.mainStat].total;

  const arcaneSlots = character.wearing.arcaneSymbols.slots
    .filter(slot => slot.itemId !== 0)
    .map((slot, index) => {
      const name = ARCANE_NAMES[index] || `ARC${index + 1}`;
      return `${name}：Lv.${slot.level}（${slot.arcaneForce}）`;
    })
    .join('\n');

  return new EmbedBuilder()
    .setTitle('✨ MSU名片')
    .setThumbnail(character.image.imageUrl)
    .addFields(
      {
        name: '角色資訊',
        value:
          `名稱：${common.name}\n` +
          `職業：${common.job.jobName}\n` +
          `等級：Lv.${common.level}\n` +
          `經驗：${common.expr}%\n` +
          `世界：${common.world.name}`,
        inline: false
      },
      {
        name: '能力值',
        value:
          `CP：${Number(stat.combatPower).toLocaleString()}\n` +
          `ARC：${stat.arcaneForce.total}\n` +
          `主屬 ${jobInfo.mainStatName}：${mainStatValue.toLocaleString()}\n` +
          `無視防禦：${stat.ignoreDefence.total}%`,
        inline: false
      },
      {
        name: 'ARC 符文',
        value: arcaneSlots || '尚未裝備 ARC 符文',
        inline: false
      },
      {
        name: '錢包地址',
        value: `\`${character.owner.walletAddress}\``,
        inline: false
      }
    );
}

module.exports = {
  formatCharacter
};