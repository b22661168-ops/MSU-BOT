const { createCanvas, loadImage } = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const { getJobInfo } = require('./jobInfo');

const ARCANE_NAMES = [
  '消逝的旅途',
  '啾啾島',
  '拉契爾恩',
  '阿爾卡娜',
  '魔菈斯',
  '艾斯佩拉'
];

async function generateCharacterCard(character) {
  const template = await loadImage('./assets/msu-card-template.png');
  const avatar = await loadImage(character.image.imageUrl);

  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(template, 0, 0);

  const common = character.common;
  const stat = character.apStat;
  const jobInfo = getJobInfo(common.job.jobName, stat);
  const mainStatValue = stat[jobInfo.mainStat].total;

  ctx.fillStyle = '#3b2a1f';
  ctx.textBaseline = 'middle';

  // 角色資訊
  ctx.font = '28px Microsoft JhengHei';
  const infoX = 215;

  ctx.fillText(common.name, infoX, 260);
  ctx.fillText(common.job.jobName, infoX, 295);
  ctx.fillText(`Lv.${common.level}`, infoX, 330);
  ctx.fillText(`${common.expr}%`, infoX, 365);
  ctx.fillText(common.world.name, infoX, 400);

  // 能力值
  ctx.fillText(Number(stat.combatPower).toLocaleString(), 200, 505);
  ctx.fillText(stat.arcaneForce.total.toString(), 200, 540);
  ctx.fillText(`${jobInfo.mainStatName} ${mainStatValue.toLocaleString()}`, 200, 575);
  ctx.fillText(`${stat.ignoreDefence.total}%`, 250, 615);

  // ARC 符文
  ctx.font = '24px Microsoft JhengHei';

  const slots = character.wearing.arcaneSymbols.slots.filter(slot => slot.itemId !== 0);

  slots.forEach((slot, index) => {
    const name = ARCANE_NAMES[index] || `ARC${index + 1}`;
    const y = 700 + index * 42;

    ctx.fillText(name, 160, y);
    ctx.fillText(`Lv.${slot.level}`, 530, y);
    ctx.fillText(`(${slot.arcaneForce})`, 620, y);
  });

  // 錢包地址
  ctx.font = '22px Microsoft JhengHei';
  ctx.fillText(character.owner.walletAddress, 105, 935);

  // 角色圖片
  ctx.drawImage(avatar, 825, 250, 500, 500);

  const buffer = canvas.toBuffer('image/png');

  return new AttachmentBuilder(buffer, {
    name: 'msu-card.png'
  });
}

module.exports = {
  generateCharacterCard
};