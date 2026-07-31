module.exports = {
  name: 'datahelp',

  async execute(message) {
    return message.reply(
`📚 Database 維護指令 主人快餵我吃東西

【物品名稱】範例
>item 2358005 核心寶石

【抽獎池名稱】範例
>layer 205038 普通獅子抽獎

【大小NESO 金額設定】
>reward 205018 small 20K
>reward 205018 big 127K
>reward 308057 normal 215K

說明：
small = 沒有 rotation 的小錢
big = rotation 54 的大錢
normal = rotation 37 的普發

【查詢抽獎】
>raffle
>raffle @玩家

資料檔案：
data/itemNames.json
data/layerNames.json
data/rewardValues.json`
    );
  }
};