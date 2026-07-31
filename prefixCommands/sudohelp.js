const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'sudohelp',
  async execute(message) {
    if (message.author.id !== process.env.OWNER_ID) return;

    const embeds = [
      new EmbedBuilder()
        .setTitle('🛠️ MSU Bot 管理指令｜核心管理')
        .setDescription([
          '**綁定管理**',
          '`>sudo bind list @使用者` 查看綁定角色',
          '`>sudo bind delete @使用者 角色名稱/別名/assetKey` 解除單一角色',
          '`>sudo bind delete-all @使用者` 解除全部綁定',
          '',
          '**PT 管理**',
          '`>sudo pt list` 查看全部有效 PT',
          '`>sudo pt view <隊伍名稱/partyId>` 查看 PT',
          '`>sudo pt find @使用者` 查詢玩家所在 PT',
          '`>sudo pt remove <隊伍> <assetKey>` 移除隊員',
          '`>sudo pt leader <隊伍> <assetKey>` 轉讓隊長',
          '`>sudo pt edit <隊伍> name/boss/difficulty <值>` 修改 PT',
          '`>sudo pt delete <隊伍>` 封存 PT',
          '',
          '新增隊員建議由 `>msuME → 我的隊伍` 操作。'
        ].join('\n')),

      new EmbedBuilder()
        .setTitle('📈 MSU Bot 管理指令｜EXP Tracker')
        .setDescription([
          '**名單管理**',
          '`>sudo exp add <KnownChar Key／角色名稱／assetKey>` 從 KnownChar 加入追蹤',
          '`>sudo exp find <關鍵字>` 搜尋 KnownChar 與 assetKey',
          '若找不到，請先使用 `>knownchar add <角色名稱> [錢包]` 驗證角色。',
          '`>sudo exp remove <assetKey>` 停止追蹤並保留歷史',
          '`>sudo exp list` 查看追蹤名單',
          '',
          '**資料與任務**',
          '`>sudo exp run` 立即執行今日正式任務',
          '`>sudo exp retry` 立即補抓 Pending',
          '`>sudo exp status` 查看今日任務狀態',
          '`>sudo exp snapshot [YYYY-MM-DD]` 查看快照',
          '`>sudo exp inspect <角色>` 查看單一角色細節',
          '`>sudo exp db` 查看資料庫摘要',
          '`>sudo exp repair` 重算既有 EXP 與圈內排名',
          '',
          '**推播與頻道測試**',
          '`>sudo exp preview [YYYY-MM-DD]` 在目前頻道預覽，不發正式推播',
          '`>sudo exp testreport [YYYY-MM-DD]` 發測試報告到 EXP_REPORT_CHANNEL_ID',
          '`>sudo exp countsync` 立即同步追蹤人數頻道',
          '`>sudo exp sync` countsync 的相容別名',
          '',
          '**舊版自動建立頻道**',
          '`>sudo exp setup` 自動建立 EXP 分類與頻道；目前已使用 .env 指定頻道時通常不需要。'
        ].join('\n')),

      new EmbedBuilder()
        .setTitle('🧰 MSU Bot 管理指令｜資料工具')
        .setDescription([
          '**KnownChar**',
          '`>knownchar search <角色名稱>` 搜尋角色並在 Console 印完整資料',
          '`>knownchar add <角色名稱> [錢包]` 新增 KnownChar',
          '`>knownchar remove <角色名稱>` 移除 KnownChar',
          '`>knownchar list` 查看 KnownChar 名單',
          '',
          '**簽到提醒（MSUSIGN）**',
          '`>msusign channel` 將目前頻道設為提醒頻道',
          '`>msusign add @使用者 [@使用者...]` 加入提醒名單',
          '`>msusign remove @使用者 [@使用者...]` 移除提醒名單',
          '`>msusign list` 查看提醒名單',
          '`>msusign on`／`>msusign off` 開啟或關閉提醒',
          '`>msusign status` 查看目前設定',
          '`>msusign test 21|23|00` 測試合併提醒訊息',
          '固定於台灣時間 21:00、23:00、00:00 發送。',
          '',
          '**其他工具**',
          '`>bind @使用者 錢包 角色名稱 別名` 新增或更新綁定',
          '`>item <itemId>` 查詢物品資料',
          '`>layer <layerId>` 查詢 Layer 資料',
          '`>wallets` 查看錢包資料',
          '`>datahelp` 查看資料管理說明',
          '',
          '**規則**',
          'KnownChar 負責角色驗證；EXP add 只讀本機 KnownChar，不會呼叫 API。',
          '角色內部識別統一使用 `assetKey`；別名只負責顯示。',
          'PT 解散只封存，不刪除歷史。',
          'EXP 正式任務每天 08:20 執行，失敗項目每 30 分鐘補抓。'
        ].join('\n'))
    ];

    try {
      await message.author.send({ embeds });
      await message.delete().catch(() => {});
    } catch (error) {
      console.error('sudohelp DM failed:', error.message || error);
      await message.reply('❌ 無法傳送管理說明私訊，請先開啟此伺服器的私人訊息。');
    }
  }
};
