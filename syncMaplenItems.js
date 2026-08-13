const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://maplen.gg';

// 不要再寫死 232 頁。
// 後面新物品增加時，頁數可能繼續增加。
// 這版會一直往後掃，直到連續遇到空頁為止。
const MAX_PAGES = 500;
const EMPTY_PAGE_STOP_COUNT = 3;

const itemNamesPath = path.join(
  __dirname,
  'data',
  'itemNames.json'
);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadCurrentItems() {
  if (!fs.existsSync(itemNamesPath)) {
    return {};
  }

  return JSON.parse(
    fs.readFileSync(itemNamesPath, 'utf8')
  );
}

function saveItems(items) {
  fs.writeFileSync(
    itemNamesPath,
    JSON.stringify(items, null, 2),
    'utf8'
  );
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (!res.ok) {
    throw new Error(
      `${res.status} ${res.statusText} - ${url}`
    );
  }

  return await res.text();
}

function extractItemLinks(html) {
  const matches = [
    ...html.matchAll(/\/items\/(\d+)/g)
  ];

  return [
    ...new Set(matches.map(m => m[1]))
  ];
}

function extractTraditionalChineseName(html) {
  const match = html.match(
    /Traditional Chinese[\s\S]*?wrap-break-word[^>]*>(.*?)<\/span>/i
  );

  if (!match) {
    return null;
  }

  return match[1]
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

async function main() {
  const items = loadCurrentItems();

  let found = 0;
  let added = 0;
  let existed = 0;
  let failed = 0;
  let noZhName = 0;

  let consecutiveEmptyPages = 0;

  console.log('====================================');
  console.log('🍁 MapleN.GG Item Name Sync');
  console.log('====================================');
  console.log(
    `目前 itemNames.json：${Object.keys(items).length} 筆`
  );
  console.log('');
  console.log('模式：只新增缺少的 Item ID');
  console.log('既有資料：完全不修改');
  console.log('====================================');
  console.log('');

  for (let page = 1; page <= MAX_PAGES; page++) {
    const listUrl =
      `${BASE_URL}/items?page=${page}`;

    console.log(
      `📄 讀取第 ${page} 頁：${listUrl}`
    );

    let listHtml;

    try {
      listHtml = await fetchText(listUrl);
    } catch (err) {
      console.log(
        `❌ 頁面讀取失敗：${err.message}`
      );
      failed++;
      await sleep(1000);
      continue;
    }

    const itemIds =
      extractItemLinks(listHtml);

    console.log(
      `   找到 ${itemIds.length} 個 Item ID`
    );

    // ====================================
    // 如果連續數頁完全沒有 Item，就停止
    // ====================================
    if (itemIds.length === 0) {
      consecutiveEmptyPages++;

      console.log(
        `   ⚠️ 空頁 (${consecutiveEmptyPages}/${EMPTY_PAGE_STOP_COUNT})`
      );

      if (
        consecutiveEmptyPages >=
        EMPTY_PAGE_STOP_COUNT
      ) {
        console.log('');
        console.log(
          '✅ 已連續遇到多個空頁，判定掃描結束。'
        );
        break;
      }

      await sleep(300);
      continue;
    }

    consecutiveEmptyPages = 0;

    for (const itemId of itemIds) {
      found++;

      // ====================================
      // 已存在：完全不碰
      // ====================================
      if (items[itemId]) {
        existed++;

        console.log(
          `   ⏭️ ${itemId} 已存在：${items[itemId]}`
        );

        continue;
      }

      // ====================================
      // 不存在才進詳細頁
      // ====================================
      const itemUrl =
        `${BASE_URL}/items/${itemId}`;

      try {
        console.log(
          `   🔍 發現新 Item：${itemId}`
        );

        const itemHtml =
          await fetchText(itemUrl);

        const zhName =
          extractTraditionalChineseName(
            itemHtml
          );

        if (!zhName) {
          noZhName++;

          console.log(
            `   ⚠️ ${itemId} 找不到繁中名稱`
          );

          continue;
        }

        // ====================================
        // 只有新 Item 才寫入
        // ====================================
        items[itemId] = zhName;

        added++;

        console.log(
          `   ➕ ${itemId} ${zhName}`
        );

        // 每新增一筆就立即儲存
        // 避免程式中途中斷前面都白跑
        saveItems(items);

        await sleep(150);

      } catch (err) {
        failed++;

        console.log(
          `   ❌ ${itemId} 失敗：${err.message}`
        );

        await sleep(500);
      }
    }

    console.log(
      `   📊 目前新增：${added}｜已存在：${existed}`
    );

    console.log('');

    await sleep(300);
  }

  saveItems(items);

  console.log('');
  console.log('====================================');
  console.log('✅ MapleN.GG 同步完成');
  console.log('====================================');
  console.log(`掃描 Item：${found}`);
  console.log(`已存在：${existed}`);
  console.log(`新增：${added}`);
  console.log(`無繁中名稱：${noZhName}`);
  console.log(`失敗：${failed}`);
  console.log(
    `目前總筆數：${Object.keys(items).length}`
  );
  console.log('====================================');
}

main().catch(err => {
  console.error('❌ Sync 發生致命錯誤：');
  console.error(err);
});