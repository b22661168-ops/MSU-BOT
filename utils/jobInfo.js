const JOB_INFO = {
    Bishop: { mainStat: 'int', mainStatName: 'INT', attack: 'magicAtt', attackName: '魔攻' },
    Bowmaster: { mainStat: 'dex', mainStatName: 'DEX', attack: 'att', attackName: '攻擊力' },
    Marksman: { mainStat: 'dex', mainStatName: 'DEX', attack: 'att', attackName: '攻擊力' },
    Pathfinder: { mainStat: 'dex', mainStatName: 'DEX', attack: 'att', attackName: '攻擊力' },
    Hero: { mainStat: 'str', mainStatName: 'STR', attack: 'att', attackName: '攻擊力' },
    Paladin: { mainStat: 'str', mainStatName: 'STR', attack: 'att', attackName: '攻擊力' },
    'Dark Knight': { mainStat: 'str', mainStatName: 'STR', attack: 'att', attackName: '攻擊力' },
    'Night Lord': { mainStat: 'luk', mainStatName: 'LUK', attack: 'att', attackName: '攻擊力' },
    Shadower: { mainStat: 'luk', mainStatName: 'LUK', attack: 'att', attackName: '攻擊力' },
    'Dual Blade': { mainStat: 'luk', mainStatName: 'LUK', attack: 'att', attackName: '攻擊力' }
  };
  
  function getJobInfo(jobName, stat) {
    if (JOB_INFO[jobName]) return JOB_INFO[jobName];
  
    return {
      mainStat: 'int',
      mainStatName: 'INT',
      attack: stat.magicAtt?.total > stat.att?.total ? 'magicAtt' : 'att',
      attackName: stat.magicAtt?.total > stat.att?.total ? '魔攻' : '攻擊力'
    };
  }
  
  module.exports = { getJobInfo };