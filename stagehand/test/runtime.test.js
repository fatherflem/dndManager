import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startStagehand} from '../src/main-world/runtime.js';
function target(){const listeners=new Map();return{addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},fire(type,event={}){for(const fn of [...(listeners.get(type)??[])])fn(event);}};}
async function fixture(){
  let time=1000,muted=false,gm=true,disables=0;const sent=[],actions=[];
  const win={...target(),location:{origin:'https://game.forge-vtt.com'},game:{version:'14.368'},postMessage:message=>sent.push(message.payload)};
  const doc={...target(),hidden:false,visibilityState:'visible'};
  const adapter={adapterStatus:'test',isGM:()=>gm,enable:async()=>{muted=true;},disable:async()=>{muted=false;disables++;},relinquish:()=>{},validateScenes:async()=>[],runAction:async action=>{actions.push(action);return{};}};
  const runtime=startStagehand({win,doc,adapter,speak:()=>{},configureTTS:()=>{},now:()=>time,setPoll:()=>1,clearPoll:()=>{},sid:'session'});
  const receive=payload=>runtime.receive({source:win,origin:win.location.origin,data:{tag:'stagehand-v1',direction:'to-page',payload}});
  await receive({type:'configure',options:{pttKey:'F13'},sheet:{cues:[{id:'bath',hotkey:'Ctrl+Alt+9',actions:[{type:'scene',name:'Bathhouse'}]}]}});
  const hotkey=()=>win.fire('keydown',{key:'9',ctrlKey:true,altKey:true,shiftKey:false,metaKey:false,preventDefault(){}});
  return{runtime,win,doc,receive,hotkey,sent,actions,advance:ms=>time+=ms,muted:()=>muted,disables:()=>disables,setGM:value=>gm=value};
}
test('hide for 60 seconds, return, and cue within one second without unmuting',async()=>{
  const f=await fixture();f.doc.hidden=true;f.doc.visibilityState='hidden';f.doc.fire('visibilitychange');f.advance(60000);await f.runtime.poll();
  assert.equal(f.disables(),0);assert.equal(f.muted(),true);assert.equal(f.sent.some(m=>m.ev==='deactivate'),false);
  f.doc.hidden=false;f.doc.visibilityState='visible';f.doc.fire('visibilitychange');
  assert.ok(f.sent.some(m=>m.type==='ready'));assert.equal(f.sent.at(-1).type,'ping');
  f.advance(500);f.hotkey();assert.equal(f.sent.at(-1).type,'transcript');assert.equal(f.sent.at(-1).cueId,'bath');assert.equal(f.muted(),true);
  await f.receive({type:'execute',command:{type:'actions',cueId:'bath',label:'Bathhouse',actions:[{type:'scene',name:'Bathhouse'}]}});
  assert.equal(f.actions.length,1);assert.ok(f.sent.some(m=>m.ev==='action'&&m.details.ok));assert.equal(f.disables(),0);
});
test('visible heartbeat timeout reconnects after 45 seconds but leaves keys and mute intact',async()=>{
  const f=await fixture();f.advance(44000);await f.runtime.poll();assert.equal(f.sent.some(m=>m.ev==='deactivate'),false);
  f.advance(2000);await f.runtime.poll();assert.ok(f.sent.some(m=>m.ev==='deactivate'&&m.details.reason==='heartbeat-timeout'&&m.details.elapsedMs===46000));
  assert.equal(f.muted(),true);assert.equal(f.disables(),0);f.hotkey();assert.equal(f.sent.at(-1).cueId,'bath');
  await f.receive({type:'heartbeat'});await f.runtime.poll();
});
test('newer-tab deactivation unbinds old keys without restoring shared volume',async()=>{
  const f=await fixture();await f.receive({type:'deactivate',reason:'newer-tab'});const count=f.sent.length;f.hotkey();assert.equal(f.sent.length,count);assert.equal(f.disables(),0);
  await f.receive({type:'deactivate',reason:'newer-tab'});assert.equal(f.sent.length,count);
});
test('losing GM status and real shutdown restore volume',async()=>{
  const f=await fixture();f.setGM(false);await f.runtime.poll();assert.equal(f.muted(),false);assert.equal(f.disables(),1);
  const second=await fixture();await second.runtime.shutdown();assert.equal(second.muted(),false);assert.equal(second.disables(),1);
});
test('a delayed configure from a previous owner cannot reactivate a superseded tab',async()=>{
  const f=await fixture();await f.receive({type:'deactivate',reason:'newer-tab',epoch:2});
  await f.receive({type:'configure',epoch:1,options:{pttKey:'F13'},sheet:{cues:[{id:'bath',hotkey:'Ctrl+Alt+9'}]}});
  const count=f.sent.length;f.hotkey();assert.equal(f.sent.length,count);assert.ok(f.sent.some(m=>m.ev==='stale-control'));assert.equal(f.disables(),0);
});
