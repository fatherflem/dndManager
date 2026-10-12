import {test} from 'node:test';
import assert from 'node:assert/strict';
let fixtureId=0;
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
async function fixture(){
  let listener;
  const requests=[],sent=[];
  const data={apiKey:'test-only',digest:'Rules',options:{extraOrigins:[]},sheet:{version:1,state:{},cues:[{id:'bath',label:'Bathhouse',voice:['bathhouse'],actions:[{type:'scene',name:'Bathhouse'}]}]},view:{tabId:7,connected:true},state:{}};
  const oldChrome=globalThis.chrome,oldFetch=globalThis.fetch;
  globalThis.chrome={runtime:{id:'test-extension',getURL:p=>`chrome-extension://test-extension/${p}`,onMessage:{addListener:fn=>listener=fn}},storage:{local:{get:async()=>structuredClone(data),set:async patch=>Object.assign(data,structuredClone(patch)),setAccessLevel:async()=>{}}},tabs:{sendMessage:async(id,msg)=>sent.push({id,...msg}),onRemoved:{addListener(){}}},commands:{onCommand:{addListener(){}}},sidePanel:{setPanelBehavior:async()=>{}}};
  let started=deferred();
  globalThis.fetch=(_url,options)=>{const response=deferred();requests.push({options,response});started.resolve();return response.promise;};
  await import(`../src/worker/index.js?fixture=${++fixtureId}`);
  const page={id:'test-extension',tab:{id:7},url:'https://game.forge-vtt.com/game'};
  const panel={id:'test-extension',url:'chrome-extension://test-extension/panel/index.html'};
  const send=(msg,sender=page)=>new Promise(resolve=>listener(msg,sender,resolve));
  const answer=(index,text)=>requests[index].response.resolve({ok:true,json:async()=>({content:[{type:'text',text}]})});
  return{data,requests,sent,page,panel,send,answer,started:()=>started.promise,nextRequest:()=>{started=deferred();},restore:()=>{globalThis.chrome=oldChrome;globalThis.fetch=oldFetch;}};
}
test('hotkey, manual and fixed voice cues execute while a lookup is pending',{timeout:2000},async()=>{
  const f=await fixture();
  try{
    for(const [msg,sender]of [[{type:'transcript',cueId:'bath'},f.page],[{type:'manual',cueId:'bath'},f.panel],[{type:'transcript',alternatives:['scene bathhouse']},f.page]]){
      f.nextRequest();const pending=f.send({type:'transcript',alternatives:['what do the rules say']});await f.started();
      const count=f.sent.filter(m=>m.type==='execute').length;
      try{
        const response=await f.send(msg,sender);
        assert.equal(response.ok,true);
        const actions=f.sent.filter(m=>m.type==='execute');assert.equal(actions.length,count+1);assert.equal(actions.at(-1).command.cueId,'bath');
        assert.equal(f.requests.at(-1).options.signal.aborted,false);
      }finally{f.answer(f.requests.length-1,'Answer. [Rules]');await pending;}
    }
  }finally{f.restore();}
});
test('only the latest lookup can save or speak a response',{timeout:2000},async()=>{
  const f=await fixture();
  try{
    const first=f.send({type:'transcript',alternatives:['first rules question']});await f.started();
    f.nextRequest();const second=f.send({type:'transcript',alternatives:['second rules question']});await f.started();
    assert.equal(f.requests[0].options.signal.aborted,true);
    // Even a transport which ignores abort must not publish the stale result.
    f.answer(0,'Old answer. [Rules]');await first;
    assert.equal(f.sent.filter(m=>m.type==='speak').length,0);assert.equal(f.data.history,undefined);
    f.answer(1,'New answer. [Rules]');await second;
    assert.equal(f.data.view.lookup.question,'second rules question');assert.equal(f.data.lastSpoken,'New answer.');
    assert.deepEqual(f.sent.filter(m=>m.type==='speak').map(m=>m.text),['New answer.']);
  }finally{for(let i=0;i<f.requests.length;i++)f.answer(i,'Cleanup. [Rules]');f.restore();}
});
