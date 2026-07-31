const db = require('./db');

function nowIso() {
  return new Date().toISOString();
}

function getOrCreateSession(partyName, settledDate, createdBy) {
  const existing = db.prepare(`
    SELECT *
    FROM settlement_sessions
    WHERE partyName = ? AND settledDate = ?
  `).get(partyName, settledDate);

  if (existing) return existing;

  const now = nowIso();

  const info = db.prepare(`
    INSERT INTO settlement_sessions (
      partyName,
      settledDate,
      status,
      createdBy,
      createdAt,
      updatedAt
    )
    VALUES (?, ?, 'OPEN', ?, ?, ?)
  `).run(partyName, settledDate, createdBy, now, now);

  return db.prepare(`
    SELECT *
    FROM settlement_sessions
    WHERE id = ?
  `).get(info.lastInsertRowid);
}

function getSession(partyName, settledDate) {
  return db.prepare(`
    SELECT *
    FROM settlement_sessions
    WHERE partyName = ? AND settledDate = ?
  `).get(partyName, settledDate);
}

function addLog(sessionId, discordId, action, detail) {
  db.prepare(`
    INSERT INTO settlement_logs (
      sessionId,
      discordId,
      action,
      detail,
      createdAt
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    sessionId,
    discordId,
    action,
    detail,
    nowIso()
  );
}

function setSessionStatus(sessionId, status, discordId) {
  const now = nowIso();

  db.prepare(`
    UPDATE settlement_sessions
    SET status = ?,
        updatedAt = ?,
        lockedAt = CASE WHEN ? = 'LOCKED' THEN ? ELSE lockedAt END,
        lockedBy = CASE WHEN ? = 'LOCKED' THEN ? ELSE lockedBy END,
        doneAt = CASE WHEN ? = 'DONE' THEN ? ELSE doneAt END,
        doneBy = CASE WHEN ? = 'DONE' THEN ? ELSE doneBy END
    WHERE id = ?
  `).run(
    status,
    now,
    status,
    now,
    status,
    discordId,
    status,
    now,
    status,
    discordId,
    sessionId
  );

  addLog(sessionId, discordId, `STATUS_${status}`, `狀態改為 ${status}`);
}

function addOrUpdateItem({
  sessionId,
  itemName,
  quantity,
  ownerDiscordId,
  mode,
  price = 0,
  remainingQuantity = 0,
  createdBy
}) {
  const now = nowIso();

  const existing = db.prepare(`
    SELECT *
    FROM settlement_items
    WHERE sessionId = ?
      AND itemName = ?
      AND ownerDiscordId = ?
      AND mode = ?
  `).get(sessionId, itemName, ownerDiscordId, mode);

  if (existing) {
    db.prepare(`
      UPDATE settlement_items
      SET quantity = ?,
          price = ?,
          remainingQuantity = ?,
          updatedAt = ?,
          updatedBy = ?
      WHERE id = ?
    `).run(
      quantity,
      price,
      remainingQuantity,
      now,
      createdBy,
      existing.id
    );

    addLog(
      sessionId,
      createdBy,
      'ITEM_UPDATE',
      `${itemName} ×${quantity} 更新`
    );

    return db.prepare(`
      SELECT *
      FROM settlement_items
      WHERE id = ?
    `).get(existing.id);
  }

  const info = db.prepare(`
    INSERT INTO settlement_items (
      sessionId,
      itemName,
      quantity,
      ownerDiscordId,
      mode,
      price,
      remainingQuantity,
      createdBy,
      updatedBy,
      createdAt,
      updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    itemName,
    quantity,
    ownerDiscordId,
    mode,
    price,
    remainingQuantity,
    createdBy,
    createdBy,
    now,
    now
  );

  addLog(
    sessionId,
    createdBy,
    'ITEM_ADD',
    `${itemName} ×${quantity} 新增`
  );

  return db.prepare(`
    SELECT *
    FROM settlement_items
    WHERE id = ?
  `).get(info.lastInsertRowid);
}

function updateItemPrice({
  sessionId,
  itemName,
  price,
  updatedBy
}) {
  const now = nowIso();

  const items = db.prepare(`
    SELECT *
    FROM settlement_items
    WHERE sessionId = ?
      AND itemName LIKE ?
    ORDER BY id ASC
  `).all(sessionId, `%${itemName}%`);

  if (items.length === 0) {
    return {
      ok: false,
      message: `找不到分寶物品：${itemName}`
    };
  }

  for (const item of items) {
    db.prepare(`
      UPDATE settlement_items
      SET price = ?,
          updatedAt = ?,
          updatedBy = ?
      WHERE id = ?
    `).run(
      price,
      now,
      updatedBy,
      item.id
    );
  }

  addLog(
    sessionId,
    updatedBy,
    'ITEM_PRICE',
    `${itemName} 成交價更新為 ${price}`
  );

  return {
    ok: true,
    items,
    price
  };
}

function listItems(sessionId) {
  return db.prepare(`
    SELECT *
    FROM settlement_items
    WHERE sessionId = ?
    ORDER BY id ASC
  `).all(sessionId);
}

function getSessionWithItems(partyName, settledDate) {
    const session = getSession(partyName, settledDate);
  
    if (!session) return null;
  
    const items = listItems(session.id);
  
    return {
      ...session,
      items
    };
  }

function listOpenSessions() {
  return db.prepare(`
    SELECT *
    FROM settlement_sessions
    WHERE status != 'DONE'
    ORDER BY settledDate DESC, updatedAt DESC
  `).all();
}

function listLogs(sessionId) {
  return db.prepare(`
    SELECT *
    FROM settlement_logs
    WHERE sessionId = ?
    ORDER BY id ASC
  `).all(sessionId);
}

module.exports = {
  getOrCreateSession,
  getSession,
  addLog,
  setSessionStatus,
  addOrUpdateItem,
  listItems,
  listOpenSessions,
  listLogs,
  getSessionWithItems,
  updateItemPrice,
};