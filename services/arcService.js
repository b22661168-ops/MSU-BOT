const ARC_INFO = {
    1712001: { name: '消逝旅途', daily: 8 },
    1712002: { name: '啾啾村', daily: 15 },
    1712003: { name: '拉契爾恩', daily: 10 },
    1712004: { name: '阿爾卡娜', daily: 10 },
    1712005: { name: '魔菈斯', daily: 6 },
    1712006: { name: '艾斯佩拉', daily: 6 },
    0: {
        name: '艾斯佩拉',
        daily: 6,
        unlockDate: '2026-07-23'
      }
  };
  
  const ARC_LEVEL_EXP = {
    1: 12,
    2: 15,
    3: 20,
    4: 27,
    5: 36,
    6: 47,
    7: 60,
    8: 75,
    9: 92,
    10: 111,
    11: 132,
    12: 155,
    13: 180,
    14: 207,
    15: 236,
    16: 267,
    17: 300,
    18: 335,
    19: 372
  };
  
  function getArcSymbols(character, options = {}) {
    const slots = [...(character?.wearing?.arcaneSymbols?.slots || [])];

    // 部分 API 回應在尚未開放時不會附帶艾斯佩拉 placeholder。
    // 為了讓 ARC UI 固定顯示六個區域，缺少時主動補上一筆。
    const hasEsfera = slots.some(slot => [0, 1712006].includes(Number(slot.itemId)));
    if (!hasEsfera) {
      slots.push({
        itemId: 0,
        level: 0,
        currentExp: 0,
        totalExp: 0,
        maxLevel: 0
      });
    }

    return slots.map(slot => {
      const itemId = Number(slot.itemId);
      const info = ARC_INFO[itemId] || {
        name: `未知ARC(${itemId})`,
        daily: 0
      };

      let daily = info.daily;

      // 拉契爾恩每日數量可自訂，範圍檢查在 msuME.js 做
      if (itemId === 1712003 && options.lacheleinDaily) {
        daily = options.lacheleinDaily;
      }

      const isEsferaPlaceholder = itemId === 0;

      return {
        ...slot,
        itemId,
        name: info.name,
        daily,
        unlockDate: info.unlockDate || null,
        disabledText: info.disabledText || null,
        isPlaceholder: isEsferaPlaceholder,

        // 艾斯佩拉尚未開放時，預估以 Lv1、0 經驗作為起點。
        level: isEsferaPlaceholder ? 1 : slot.level,
        currentExp: isEsferaPlaceholder ? 0 : slot.currentExp,
        totalExp: isEsferaPlaceholder ? ARC_LEVEL_EXP[1] : slot.totalExp,
        maxLevel: isEsferaPlaceholder ? 20 : slot.maxLevel
      };
    });
  }
  
  function calcNextLevelDays(symbol, options = {}) {
    if (symbol.disabledText) return null;
    if (symbol.level >= symbol.maxLevel) return 0;

    const remain = Math.max(symbol.totalExp - symbol.currentExp, 0);
    const dailyRunsNeeded = Math.ceil(remain / symbol.daily);

    // 預設今日每日已完成，所以從明天起算。
    // 若今日尚未完成，今天可先取得一次每日量，日曆天數會少 1 天。
    return options.todayCompleted === false
      ? Math.max(dailyRunsNeeded - 1, 0)
      : dailyRunsNeeded;
  }
  
  function percent(current, total) {
    if (!total) return 0;
    return Math.floor((current / total) * 100);
  }
  
  function getArcEmoji(itemId) {
    const map = {
      1712001: '🌊',
      1712002: '🍗',
      1712003: '🏰',
      1712004: '🌲',
      1712005: '🌌',
      1712006: '🌠',
      0: '🌠'
    };
  
    return map[itemId] || '🌀';
  }
  
  function getArcForce(level) {
    if (!level || level <= 0) return 0;
    return (level + 2) * 10;
  }

  function simulateArc(symbol, days) {
    if (symbol.disabledText) {
      return {
        ...symbol,
        futureLevel: 0,
        futureExp: 0
      };
    }
  
    if (symbol.level >= symbol.maxLevel) {
        return {
          ...symbol,
          futureLevel: symbol.level,
          futureExp: symbol.currentExp,
          isMax: true,
          currentArcForce: getArcForce(symbol.level),
          futureArcForce: getArcForce(symbol.level),
          arcForceGain: 0
        };
      }
  
    let level = symbol.level;
    let currentExp = symbol.currentExp;
    const effectiveDays = getEffectiveDays(
        days,
        symbol.unlockDate
      );
      
      let gained = effectiveDays * symbol.daily;
  
    while (gained > 0 && level < symbol.maxLevel) {
      const required = ARC_LEVEL_EXP[level];
  
      if (!required) break;
  
      const need = required - currentExp;
  
      if (gained >= need) {
        gained -= need;
        level += 1;
        currentExp = 0;
      } else {
        currentExp += gained;
        gained = 0;
      }
    }
  
    return {
        ...symbol,
        futureLevel: level,
        futureExp: currentExp,
        remainingGain: gained,
        isMax: level >= symbol.maxLevel,
        currentArcForce: getArcForce(symbol.level),
        futureArcForce: getArcForce(level),
        arcForceGain: getArcForce(level) - getArcForce(symbol.level)
      };
  }
  
  function getEffectiveDays(days, unlockDate) {
    if (!unlockDate) return days;
  
    const today = new Date();
    today.setHours(0, 0, 0, 0);
  
    const unlock = new Date(unlockDate);
    unlock.setHours(0, 0, 0, 0);
  
    // 已經開放
    if (today >= unlock) {
      return days;
    }
  
    // 距離開放還有幾天
    const untilUnlock = Math.floor(
      (unlock - today) / 86400000
    );
  
    // 預估日期還沒到開放日
    if (days <= untilUnlock) {
      return 0;
    }
  
    // 只算開放之後的天數
    return days - untilUnlock;
  }

  function getDaysUntil(targetDateString) {
    const target = new Date(targetDateString);
  
    if (Number.isNaN(target.getTime())) {
      return null;
    }
  
    const today = new Date();
  
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
  
    return Math.floor((target - today) / 86400000);
  }
  function isUnlockedOnTarget(symbol, days) {
    if (!symbol.unlockDate) return true;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(today);
    target.setDate(target.getDate() + Math.max(Number(days) || 0, 0));

    const unlock = new Date(symbol.unlockDate);
    unlock.setHours(0, 0, 0, 0);

    return target >= unlock;
  }

  function projectArcSymbols(character, targetDateString, options = {}) {
    const days = getDaysUntil(targetDateString);
    if (days === null) throw new Error('INVALID_DATE');
    if (days < 0) throw new Error('PAST_DATE');

    const startOffset = options.todayCompleted === false ? 0 : 1;
    const simulationDays = Math.max(days - startOffset + 1, 0);
    const symbols = getArcSymbols(character, options);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const projected = symbols.map(symbol => {
      if (symbol.isPlaceholder && !isUnlockedOnTarget(symbol, days)) {
        return {
          ...symbol,
          futureLevel: 0,
          futureExp: 0,
          isMax: false,
          currentArcForce: 0,
          futureArcForce: 0,
          arcForceGain: 0,
          unavailable: true
        };
      }

      let dailyRuns = simulationDays;
      if (symbol.unlockDate) {
        const unlock = new Date(symbol.unlockDate);
        unlock.setHours(0, 0, 0, 0);
        const unlockOffset = Math.floor((unlock - today) / 86400000);
        const firstAvailableOffset = Math.max(startOffset, unlockOffset);
        dailyRuns = Math.max(days - firstAvailableOffset + 1, 0);
      }

      // dailyRuns 已在這裡精確處理開放日與「今日是否完成」，
      // 避免 simulateArc 再次扣除尚未開放天數。
      const simulated = simulateArc({ ...symbol, unlockDate: null }, dailyRuns);
      return { ...simulated, unlockDate: symbol.unlockDate };
    });

    return { days, simulationDays, symbols, projected };
  }

  function optimizeSelectableArc(projectedSymbols, selectableAmount) {
    const amount = Number(selectableAmount);
    if (!Number.isInteger(amount) || amount < 0) throw new Error('INVALID_SELECTABLE_AMOUNT');

    let remaining = amount;
    const states = projectedSymbols.map((symbol, index) => {
      const level = Number(symbol.futureLevel ?? symbol.level ?? 0);
      const currentExp = Number(symbol.futureExp ?? symbol.currentExp ?? 0);
      return {
        ...symbol,
        _index: index,
        optimizedLevel: level,
        optimizedExp: currentExp,
        invested: 0,
        gainedLevels: 0,
        startLevel: level,
        startExp: currentExp
      };
    });

    while (remaining > 0) {
      const candidates = states
        .filter(state => !state.disabledText && !state.unavailable && state.optimizedLevel > 0 && state.optimizedLevel < state.maxLevel)
        .map(state => {
          const required = ARC_LEVEL_EXP[state.optimizedLevel];
          if (!required) return null;
          return {
            state,
            cost: Math.max(required - state.optimizedExp, 0)
          };
        })
        .filter(Boolean)
        .filter(candidate => candidate.cost > 0 && candidate.cost <= remaining)
        .sort((a, b) => a.cost - b.cost || a.state._index - b.state._index);

      if (!candidates.length) break;

      const { state, cost } = candidates[0];
      state.invested += cost;
      state.gainedLevels += 1;
      state.optimizedLevel += 1;
      state.optimizedExp = 0;
      remaining -= cost;
    }

    for (const state of states) {
      state.optimizedArcForce = getArcForce(state.optimizedLevel);
      state.optimizedArcGain = state.optimizedArcForce - Number(state.futureArcForce || 0);
      state.isOptimizedMax = state.optimizedLevel >= state.maxLevel;
    }

    return {
      requested: amount,
      used: amount - remaining,
      remaining,
      states
    };
  }

  function formatArcOptimizerText(character, targetDateString, selectableAmount, options = {}) {
    let projection;
    try {
      projection = projectArcSymbols(character, targetDateString, options);
    } catch (error) {
      if (error.message === 'INVALID_DATE') return '❌ 日期格式錯誤，請輸入 `YYYY-MM-DD`，例如：`2026-07-24`';
      if (error.message === 'PAST_DATE') return '❌ 不能預估過去日期。';
      throw error;
    }

    let optimized;
    try {
      optimized = optimizeSelectableArc(projection.projected, selectableAmount);
    } catch (error) {
      if (error.message === 'INVALID_SELECTABLE_AMOUNT') return '❌ 自選 ARC 必須是 0 以上的整數。';
      throw error;
    }

    const name = character?.common?.name || '未知角色';
    const currentTotal = Number(character?.wearing?.arcaneSymbols?.totalArcaneForce || 0);
    const naturalTotal = projection.projected.reduce((sum, symbol) => sum + Number(symbol.futureArcForce || 0), 0);
    const optimizedTotal = optimized.states.reduce((sum, symbol) => sum + Number(symbol.optimizedArcForce || 0), 0);
    const naturalGain = naturalTotal - currentTotal;
    const selectableGain = optimizedTotal - naturalTotal;

    const lines = [
      `## 🎁 ${name}｜ARC 最佳化`,
      `📅 預估日期：**${targetDateString}**（${projection.days} 天後）`,
      `🎁 自選 ARC：**${optimized.requested.toLocaleString()} 顆**`,
      options.todayCompleted === false
        ? '☐ 今日每日尚未完成｜計算包含今日每日'
        : '☑️ 今日每日已完成｜計算從明日開始',
      options.lacheleinDaily ? `🏰 拉契爾恩每日：${options.lacheleinDaily} 顆` : '',
      '',
      `🌀 ARC：**${currentTotal} → ${naturalTotal} → ${optimizedTotal}**`,
      `📈 每日自然成長：${naturalGain >= 0 ? '+' : ''}${naturalGain}`,
      `✨ 自選符文增加：+${selectableGain}`,
      ''
    ].filter(Boolean);

    const allocations = optimized.states.filter(state => state.invested > 0);
    if (allocations.length) {
      lines.push('### 🎯 建議兌換');
      for (const state of allocations) {
        const progress = state.isOptimizedMax
          ? 'MAX'
          : `${state.optimizedExp}/${ARC_LEVEL_EXP[state.optimizedLevel] || '?'}`;
        lines.push(
          `${getArcEmoji(state.itemId)} **${state.name}**｜投入 ${state.invested}｜Lv.${state.startLevel} → Lv.${state.optimizedLevel}｜${progress}`
        );
      }
    } else {
      lines.push('### 🎯 建議兌換');
      lines.push('目前數量不足以讓任何符文立即升級。');
    }

    lines.push('');
    lines.push(`📦 使用：${optimized.used.toLocaleString()}｜剩餘：${optimized.remaining.toLocaleString()}`);
    lines.push('');
    lines.push('⚠️ 請再次確認今日每日狀態，以及角色已下線讓 API 儲存最新資料。');
    lines.push('💡 系統會在每次升級後重新計算下一級成本，同一顆符文可能連續升多級。');

    return lines.join('\n');
  }

  function formatArcText(character, options = {}) {
    const name = character?.common?.name || '未知角色';
    const level = character?.common?.level || '?';
    const totalArcaneForce = character?.wearing?.arcaneSymbols?.totalArcaneForce || 0;
    const symbols = getArcSymbols(character, options);
  
    const lines = [];
  
    lines.push(`🌀 **${name}｜Lv.${level}｜ARC ${totalArcaneForce}**`);
  
    if (options.lacheleinDaily) {
      lines.push(`⚙️ 拉契爾恩每日：${options.lacheleinDaily} 顆`);
    }
  
    lines.push('');
  
    for (const s of symbols) {
      if (s.itemId === 0) {
        lines.push(`🌠 ${s.name}｜尚未開放`);
        continue;
      }
  
      if (s.disabledText) {
        lines.push(`🌠 ${s.name}｜${s.disabledText}`);
        continue;
      }
  
      if (s.level >= s.maxLevel) {
        lines.push(`${getArcEmoji(s.itemId)} ${s.name}｜Lv.${s.level}｜MAX`);
        continue;
      }
  
      const p = percent(s.currentExp, s.totalExp);
      const days = calcNextLevelDays(s, options);
  
      lines.push(
        `${getArcEmoji(s.itemId)} ${s.name}｜Lv.${s.level}｜${s.currentExp}/${s.totalExp}｜${p}%｜${days}天`
      );
    }
  
    lines.push('');
    lines.push('💡 最後面的「幾天」代表預估還要幾天可以升級。');

    return lines.join('\n');
  }
  
  function formatArcFutureText(character, targetDateString, options = {}) {
    const days = getDaysUntil(targetDateString);
  
    if (days === null) {
      return '❌ 日期格式錯誤，請輸入 `YYYY-MM-DD`，例如：`2026-07-24`';
    }
  
    if (days < 0) {
      return '❌ 不能預估過去日期。';
    }
  
    const name = character?.common?.name || '未知角色';
    const level = character?.common?.level || '?';
    const totalArcaneForce = character?.wearing?.arcaneSymbols?.totalArcaneForce || 0;
    const lines = [];
    const { projected: futures } = projectArcSymbols(character, targetDateString, options);
    const futureTotalArcaneForce = futures.reduce((sum, s) => {
      if (s.disabledText) return sum;
      return sum + (s.futureArcForce || 0);
    }, 0);
    
    const arcForceGain = futureTotalArcaneForce - totalArcaneForce;

    lines.push(`🌀 **${name}｜Lv.${level}｜ARC ${totalArcaneForce} → ${futureTotalArcaneForce}（+${arcForceGain}）**`);
    lines.push(`📅 預估日：${targetDateString}｜距離 ${days} 天`);
    lines.push(options.todayCompleted === false
      ? '📌 計算方式：今日每日尚未完成（包含今日）'
      : '📌 計算方式：今日每日已完成（從明日開始）');
    if (options.lacheleinDaily) {
      lines.push(`⚙️ 拉契爾恩每日：${options.lacheleinDaily} 顆`);
    }
  
    lines.push('');
  
    for (const s of futures) {
      if (s.disabledText) {
        lines.push(`🌠 ${s.name}｜${s.disabledText}`);
        continue;
      }
  
      if (s.level >= s.maxLevel) {
        lines.push(`${getArcEmoji(s.itemId)} ${s.name}｜Lv.${s.level}｜MAX`);
        continue;
      }
  
      if (s.isMax) {
        const fromLevel = s.level <= 0 ? 1 : s.level;
        const toLevel = s.futureLevel <= 0 ? 1 : s.futureLevel;
        
        lines.push(
          `${getArcEmoji(s.itemId)} ${s.name}｜Lv.${fromLevel} → Lv.${toLevel}｜MAX`
        );
        continue;
      }
      
      const required = ARC_LEVEL_EXP[s.futureLevel] || s.totalExp;
      
      const gainText = s.arcForceGain > 0
        ? `｜+${s.arcForceGain} ARC`
        : '';
      
        const fromLevel = s.level <= 0 ? 1 : s.level;
        const toLevel = s.futureLevel <= 0 ? 1 : s.futureLevel;
        
        lines.push(
          `${getArcEmoji(s.itemId)} ${s.name}｜Lv.${fromLevel} → Lv.${toLevel}｜${s.futureExp}/${required}${gainText}`
        );
    }
  
    return lines.join('\n');
  }
  
  module.exports = {
    getArcSymbols,
    calcNextLevelDays,
    formatArcText,
    simulateArc,
    getDaysUntil,
    formatArcFutureText,
    projectArcSymbols,
    optimizeSelectableArc,
    formatArcOptimizerText
  };