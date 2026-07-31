const { updateNxpcChannel } = require('./trackers/nxpcTracker');
const { startExpTrackerScheduler, stopExpTrackerScheduler } = require('./expTracker/scheduler');

const NXPC_UPDATE_INTERVAL_MS = 10 * 60 * 1000;
let nxpcTimer = null;

/**
 * 啟動所有背景排程。
 * 重複呼叫時不會建立第二組計時器。
 *
 * @param {import('discord.js').Client} client
 */
function startSchedulers(client) {
  if (nxpcTimer) {
    console.warn('⚠️ 背景排程已啟動，略過重複建立。');
    return;
  }

  // Bot 上線後立即更新一次，不必等待第一個 10 分鐘。
  void updateNxpcChannel(client);

  nxpcTimer = setInterval(() => {
    void updateNxpcChannel(client);
  }, NXPC_UPDATE_INTERVAL_MS);

  // 不讓這個計時器阻止 Node.js 正常結束。
  nxpcTimer.unref?.();

  startExpTrackerScheduler(client);
  console.log('✅ NXPC 價格排程已啟動（每 10 分鐘更新）');
}

function stopSchedulers() {
  if (!nxpcTimer) return;

  clearInterval(nxpcTimer);
  nxpcTimer = null;
  stopExpTrackerScheduler();
  console.log('🛑 背景排程已停止');
}

module.exports = {
  startSchedulers,
  stopSchedulers
};
