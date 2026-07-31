const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://maplen.gg';
const TOTAL_PAGES = 232;

const itemNamesPath = path.join(__dirname, 'data', 'itemNames.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadCurrentItems() {
  if (!fs.existsSync(itemNamesPath)) return {};
  return JSON.parse(fs.readFileSync(itemNamesPath, 'utf8'));
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
    throw new Error(`${res.status} ${res.statusText} - ${url}`);
  }

  return await res.text();
}

function extractItemLinks(html) {
  const matches = [...html.matchAll(/\/items\/(\d+)/g)];
  return [...new Set(matches.map(m => m[1]))];
}

function extractTraditionalChineseName(html) {
    const match = html.match(
      /Traditional Chinese[\s\S]*?wrap-break-word[^>]*>(.*?)<\/span>/i
    );
  
    return match ? match[1].trim() : null;
  }

async function main() {
  const items = loadCurrentItems();

  let found = 0;
  let added = 0;
  let updated = 0;

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const listUrl = `${BASE_URL}/items?page=${page}`;
    console.log(`📄 讀取第 ${page}/${TOTAL_PAGES} 頁：${listUrl}`);

    const listHtml = await fetchText(listUrl);
    const itemIds = extractItemLinks(listHtml);

    console.log(`  找到 ${itemIds.length} 個物品`);

    for (const itemId of itemIds) {
      found++;

      const itemUrl = `${BASE_URL}/items/${itemId}`;

      try {
        const itemHtml = await fetchText(itemUrl);
       
        const zhName = extractTraditionalChineseName(itemHtml);

        if (!zhName) {
          console.log(`  ⚠️ ${itemId} 找不到繁中名稱`);
          continue;
        }

        if (items[itemId]) {
            console.log(`  ⏭️ ${itemId} 已存在：${items[itemId]}，跳過`);
            continue;
          }
          
          items[itemId] = finalName;
          added++;
          console.log(`  ➕ ${itemId} ${finalName}${zhName ? '' : '（無繁中，用英文）'}`);

        await sleep(100);
      } catch (err) {
        console.log(`  ❌ ${itemId} 失敗：${err.message}`);
      }
    }

    saveItems(items);
    await sleep(300);
  }

  saveItems(items);

  console.log('====================');
  console.log(`✅ 掃描完成`);
  console.log(`找到連結：${found}`);
  console.log(`新增：${added}`);
  console.log(`更新：${updated}`);
  console.log(`總筆數：${Object.keys(items).length}`);
}

main().catch(err => {
  console.error(err);
});