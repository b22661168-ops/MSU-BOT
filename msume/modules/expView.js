'use strict';
const {ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder}=require('discord.js');
const {getBinding}=require('../../services/bindingService');
const repo=require('../../services/expTracker/repository');
const {formatBigInt}=require('../../services/expTracker/service');
const {getCharacters,getDefaultCharacter}=require('./characterUtils');
const {buildBackHomeButton}=require('./homeView');
function arrow(v){if(v==null||v===0)return '—';return v>0?`▲${v}`:`▼${Math.abs(v)}`;}
function buildExpPayload(ownerId,assetKey=null){
 const bind=getBinding(ownerId); if(!bind)return{content:'❌ 尚未綁定角色。',components:[buildBackHomeButton(ownerId)]};
 const chars=getCharacters(bind); const selected=chars.find(c=>c.assetKey===assetKey)||getDefaultCharacter(bind)||chars[0];
 if(!selected)return{content:'❌ 找不到角色。',components:[buildBackHomeButton(ownerId)]};
 const row=repo.getLatestSnapshot(selected.assetKey);
 const menu=chars.length>1?new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_exp_char|${ownerId}`).setPlaceholder('切換角色').addOptions(chars.slice(0,25).map(c=>({label:(c.alias||c.characterName||c.assetKey).slice(0,100),description:(c.characterName||c.assetKey).slice(0,100),value:c.assetKey,default:c.assetKey===selected.assetKey})))):null;
 const content=row?[`## 📈 ${row.characterName}｜經驗追蹤`,`Lv.${row.level}${row.jobName?`｜${row.jobName}`:''}`,`今日 EXP：${row.gainedExp==null?'尚無前日資料':`${BigInt(row.gainedExp)>=0n?'+':''}${formatBigInt(row.gainedExp)}`}`,`圈內排名：#${row.localRank||'—'} ${arrow(row.localRankChange)}`,`世界排名：${row.worldRank?`#${row.worldRank}`:'—'} ${arrow(row.worldRankChange)}`,`資料日期：${row.jobDate}`,`取得時間：${new Date(row.capturedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}`].join('\n'):[`## 📈 ${selected.characterName||selected.alias}｜經驗追蹤`,'目前尚無快照資料。管理員加入追蹤並完成每日查詢後會顯示。'].join('\n');
 return{content,components:[...(menu?[menu]:[]),buildBackHomeButton(ownerId)]};
}
module.exports={buildExpPayload};
