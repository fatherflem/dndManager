import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportLog} from '../src/shared/logExport.js';
test('Copy log exports only the latest 300 entries as JSON',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let copied;
  Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async text=>copied=text}},configurable:true});
  try{await exportLog('copy',Array.from({length:400},(_,i)=>({ev:String(i)})));const data=JSON.parse(copied);assert.equal(data.length,300);assert.equal(data[0].ev,'100');assert.equal(data.at(-1).ev,'399');}
  finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});
test('Download log contains every entry and uses a dated JSON filename',async()=>{
  const oldDocument=globalThis.document,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldTimer=globalThis.setTimeout;
  let blob,clicked=false,removed=false,revoked=false;const link={click(){clicked=true;},remove(){removed=true;}};
  globalThis.document={createElement:()=>link,body:{append(){}}};URL.createObjectURL=value=>{blob=value;return'blob:test';};URL.revokeObjectURL=()=>revoked=true;globalThis.setTimeout=fn=>{fn();return 1;};
  try{const entries=Array.from({length:1000},(_,i)=>({ev:String(i)}));await exportLog('download',entries);assert.deepEqual(JSON.parse(await blob.text()),entries);assert.match(link.download,/^stagehand-log-\d{4}-\d{2}-\d{2}\.json$/);assert.ok(clicked&&removed&&revoked);}
  finally{globalThis.document=oldDocument;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;globalThis.setTimeout=oldTimer;}
});
