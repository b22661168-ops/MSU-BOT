const db = require('./services/db');

const result = db.prepare(`
  DELETE FROM raffle_history_results
  WHERE raffledAt LIKE ?
`).run('2026-08-13%');

console.log(`✅ 已刪除 2026-08-13 抽獎快取：${result.changes} 筆`);