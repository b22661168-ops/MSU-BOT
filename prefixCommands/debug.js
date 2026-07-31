'use strict';
require('dotenv').config({ quiet: true });
const fs=require('fs');
const path=require('path');
const {getCharacterDetail}=require('../services/msuApi');
const {mapCharacterProgress}=require('../services/expTracker/fieldMapper');

async function main(){
  const input=process.argv[2];
  if(!input){ console.log('用法：node prefixCommands/debug.js <assetKey|json檔案>'); process.exitCode=1; return; }
  let raw;
  if(input.endsWith('.json')) raw=JSON.parse(fs.readFileSync(path.resolve(input),'utf8'));
  else {
    raw=await getCharacterDetail(input);
    const out=path.join(__dirname,'..','data','debug',`character-${input}-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(raw,null,2));
    console.log(`完整 response 已保存：${out}`);
  }
  const mapped=mapCharacterProgress(raw,input.endsWith('.json')?null:input);
  console.log('\n=== EXP Tracker 欄位解析 ===');
  console.log(JSON.stringify(mapped,null,2));
  if(!mapped.valid) process.exitCode=2;
}
main().catch(error=>{ console.error(error.response?.data||error.stack||error); process.exitCode=1; });
