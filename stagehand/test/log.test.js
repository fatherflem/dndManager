import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLogger} from '../src/worker/log.js';
function fixture(extra={}){
  const data={...extra};let writes=0,next=0;const timers=new Map();
  const logger=createLogger({storage:{get:async()=>structuredClone(data),set:async patch=>{writes++;Object.assign(data,structuredClone(patch));}},setTimer:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimer:id=>timers.delete(id),now:()=>new Date('2026-10-16T16:00:00Z')});
  const record=(ev,details={})=>logger.record({src:'page',sid:'page-session',tab:7,ev},details);
  return{logger,data,record,timers,writes:()=>writes};
}
test('log retains the latest 1000 entries in order across batches',async()=>{
  const f=fixture();for(let i=0;i<1107;i++)f.record('event',{name:String(i)});await f.logger.flush();
  assert.equal(f.data.log.length,1000);assert.equal(f.data.log[0].name,'107');assert.equal(f.data.log.at(-1).name,'1106');
  assert.deepEqual(Object.keys(f.data.log[0]).slice(0,5),['t','src','sid','tab','ev']);
});
test('keys, digests and request bodies cannot enter persisted or exported logs',async()=>{
  const apiKey='nonstandard-key-value',digest='PRIVATE DIGEST CONTENT';const f=fixture({apiKey,digest});
  f.record('action',{apiKey,digest,body:JSON.stringify({apiKey,digest}),headers:{'x-api-key':apiKey},error:`failed ${apiKey} ${digest}`,transcript:'sk-ant-test-secret'});
  const entries=await f.logger.flush(),json=JSON.stringify(entries);
  for(const value of [apiKey,digest,'sk-ant-test-secret','body','headers','apiKey'])assert.equal(json.includes(value),false,value);
  assert.match(json,/REDACTED/);assert.deepEqual(entries,f.data.log);
});
test('logging waits for 500 ms or 50 entries and does not await writes',async()=>{
  const f=fixture();for(let i=0;i<49;i++)f.record('message');assert.equal(f.writes(),0);assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,500);
  f.record('fiftieth');await f.logger.flush();assert.equal(f.data.log.length,50);assert.equal(f.timers.size,0);
  f.record('timed');const timer=[...f.timers.values()][0];timer.fn();await f.logger.flush();assert.equal(f.data.log.length,51);
});
test('clear empties stored and buffered entries, including queued flushes',async()=>{
  const f=fixture();for(let i=0;i<50;i++)f.record('queued');f.record('buffered');await f.logger.clear();assert.deepEqual(f.data.log,[]);assert.equal(f.timers.size,0);assert.deepEqual(await f.logger.flush(),[]);
});
