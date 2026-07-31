'use strict';
const repo=require('./repository');
const {taipeiDate,runJob,updateCountChannel}=require('./service');
let timer=null; let running=false; let lastCountSyncMinute=null;
function taipeiParts(){ const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()); return Object.fromEntries(parts.map(p=>[p.type,p.value])); }
async function tick(client){ if(running)return; running=true; try{ const p=taipeiParts(),date=taipeiDate(); if(p.hour==='08'&&p.minute==='20'&&!repo.getJob(date)) await runJob(client,date); const minute=Number(p.minute); if(minute%10===0&&lastCountSyncMinute!==`${date}-${p.hour}-${p.minute}`){ lastCountSyncMinute=`${date}-${p.hour}-${p.minute}`; await updateCountChannel(client); } for(const jobDate of repo.duePendingJobs()) await runJob(client,jobDate); }catch(error){console.error('[EXP] scheduler:',error.stack||error);}finally{running=false;} }
function startExpTrackerScheduler(client){ if(timer)return; void updateCountChannel(client); void tick(client); timer=setInterval(()=>void tick(client),60*1000); timer.unref?.(); console.log('✅ EXP Tracker 排程已啟動（08:20；失敗每 30 分鐘補抓）'); }
function stopExpTrackerScheduler(){ if(timer)clearInterval(timer); timer=null; }
module.exports={startExpTrackerScheduler,stopExpTrackerScheduler};
