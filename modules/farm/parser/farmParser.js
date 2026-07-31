function cleanEmoji(text) {
    return String(text ?? '')
      .replace(/<a?:[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  function parseWarehouse(text) {
    if (!text || text.includes('無')) return 0;
  
    const match = text.match(/(\d+)/);
    return match ? Number(match[1]) : null;
  }
  
  function parseLimit(text) {
    const match = text.match(/個人\s*(\d+\/\d+)\s*全局\s*(\d+\/\d+)/);
    if (!match) {
      return {
        personalLimit: null,
        globalLimit: null
      };
    }
  
    return {
      personalLimit: match[1],
      globalLimit: match[2]
    };
  }
  
  function parseFarmMessage(rawText) {
    const text = String(rawText ?? '');
  
    const ownerMatch = text.match(/#\s*(?:<[^>]+>\s*)?(.+?)\s+的魔法農場/);
    const ownerName = ownerMatch ? cleanEmoji(ownerMatch[1]) : null;
  
    const result = {
      ownerName,
      fields: [],
      seeds: [],
      products: [],
      rawText: text
    };
  
    // 農田
    const fieldRegex = /\*\*農田#(\d+)\*\*\s+(.+?)\s+`(.+?)`/g;
    let fieldMatch;
  
    while ((fieldMatch = fieldRegex.exec(text)) !== null) {
      result.fields.push({
        fieldNo: Number(fieldMatch[1]),
        cropName: cleanEmoji(fieldMatch[2]),
        status: cleanEmoji(fieldMatch[3])
      });
    }
  
    // 切區塊
    const seedBlock = text.match(/\*\*── 購買種子 ──\*\*([\s\S]*?)(?:\*\*── 出售作物 ──\*\*|$)/)?.[1] ?? '';
    const productBlock = text.match(/\*\*── 出售作物 ──\*\*([\s\S]*)/)?.[1] ?? '';
  
    // 種子
    const seedRegex = /【(.+?)】\*\*(.+?種子)\*\*[\s\S]*?\*\*(\d+)\*\*\s*耕耘幣[\s\S]*?`([^`]*倉庫[^`]*)`\s*\|\s*`([^`]*)`/g;
    let seedMatch;
  
    while ((seedMatch = seedRegex.exec(seedBlock)) !== null) {
      const limits = parseLimit(seedMatch[5]);
  
      result.seeds.push({
        rarity: cleanEmoji(seedMatch[1]),
        itemName: cleanEmoji(seedMatch[2]),
        price: Number(seedMatch[3]),
        warehouseText: cleanEmoji(seedMatch[4]),
        warehouseCount: parseWarehouse(seedMatch[4]),
        personalLimit: limits.personalLimit,
        globalLimit: limits.globalLimit
      });
    }
  
    // 作物
    const productRegex = /【(.+?)】\*\*(.+?)\*\*[\s\S]*?(?:~~\d+~~\s*)?\*\*(\d+)\*\*\s*耕耘幣[\s\S]*?`([^`]*倉庫[^`]*)`\s*\|\s*`([^`]*)`/g;
    let productMatch;
  
    while ((productMatch = productRegex.exec(productBlock)) !== null) {
      const limits = parseLimit(productMatch[5]);
  
      result.products.push({
        rarity: cleanEmoji(productMatch[1]),
        itemName: cleanEmoji(productMatch[2]),
        price: Number(productMatch[3]),
        warehouseText: cleanEmoji(productMatch[4]),
        warehouseCount: parseWarehouse(productMatch[4]),
        personalLimit: limits.personalLimit,
        globalLimit: limits.globalLimit
      });
    }
  
    return result;
  }
  
  module.exports = {
    parseFarmMessage
  };