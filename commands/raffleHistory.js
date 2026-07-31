const { getCharacterRaffleHistory } = require("../msuApi");

async function execute(message, args) {
  try {
    // 暫時先吃參數測試
    // >raffle history test characterAssetKey walletAddress
    const sub = args[0];

    if (sub !== "test") {
      return message.reply("目前先用：`>raffle history test characterAssetKey walletAddress` 測試 API 回傳");
    }

    const characterAssetKey = args[1];
    const walletAddress = args[2];
    const raffledAt = args[3] || null;

    if (!characterAssetKey || !walletAddress) {
      return message.reply("格式：`>raffle history test characterAssetKey walletAddress [raffledAt]`");
    }

    const data = await getCharacterRaffleHistory(characterAssetKey, walletAddress, raffledAt);

    console.log("===== RAFFLE HISTORY RAW DATA =====");
    console.log(JSON.stringify(data, null, 2));

    return message.reply(
      [
        "✅ 已成功取得 raffle history 原始資料，請看 console。",
        `walletAddress: ${data.walletAddress}`,
        `characterAssetKey: ${data.characterAssetKey}`,
        `histories 筆數: ${Array.isArray(data.histories) ? data.histories.length : "未知"}`,
        `updatedAt: ${data.updatedAt}`,
      ].join("\n")
    );
  } catch (err) {
    console.error(err);
    return message.reply(`❌ raffle history 查詢失敗：${err.message}`);
  }
}

module.exports = {
  execute,
};