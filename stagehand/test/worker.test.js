import {test} from 'node:test';
import assert from 'node:assert/strict';
let fixtureId=0;
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
async function fixture(){
  let listener;
  const requests=[],sent=[];
  const data={apiKey:'test-only',digest:'Rules',options:{extraOrigins:[]},sheet:{version:1,state:{},cues:[{id:'bath',label:'Bathhouse',voice:['bathhouse'],actions:[{type:'scene',name:'Bathhouse'}]}]},view:{tabId:7,connected:true},state:{}};
  const oldChrome=globalThis.chrome,oldFetch=globalThis.fetch;
  globalThis.chrome={runtime:{id:'test-extension',getURL:p=>`chrome-extension://test-extension/${p}`,onMessage:{addListener:fn=>listener=fn}},storage:{local:{get:async()=>structuredClone(data),set:async patch=>Object.assign(data,structuredClone(patch)),setAccessLevel:async()=>{}}},tabs:{sendMessage:async(id,msg)=>sent.push({id,...msg}),onRemoved:{addListener(){}}},scripting:{getRegisteredContentScripts:async()=>[],registerContentScripts:async()=>{},unregisterContentScripts:async()=>{}},commands:{onCommand:{addListener(){}}},sidePanel:{setPanelBehavior:async()=>{}}};
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
test('two rapid next scene commands reserve and advance two distinct cues',{timeout:2000},async()=>{
  const f=await fixture();
  try{
    f.data.sheet.cues.push({id:'audio',voice:['audio'],actions:[{type:'stop_all'}]},...['second','third'].map(id=>({id,label:id,voice:[id],actions:[{type:'scene',name:id}]})));
    f.data.view.currentCue='bath';
    // Do not deliver either page result until both commands have been issued.
    const responses=await Promise.all([
      f.send({type:'transcript',alternatives:['next scene']}),
      f.send({type:'transcript',alternatives:['next scene']})
    ]);
    assert.ok(responses.every(r=>r.ok));
    assert.deepEqual(f.sent.filter(m=>m.type==='execute').map(m=>m.command.cueId),['second','third']);
    assert.equal(f.data.view.currentCue,'bath');assert.equal(f.data.view.navigationCue,'third');
    await f.send({type:'result',cueId:'second',spoken:'Second.'});
    await f.send({type:'result',cueId:'third',spoken:'Third.'});
    assert.equal(f.data.view.currentCue,'third');
  }finally{f.restore();}
});
test('concurrent handlers preserve independent state and view patches',{timeout:2000},async()=>{
  const f=await fixture();
  try{
    f.data.sheet.state={first:0,second:0};f.data.state={first:0,second:0};
    const responses=await Promise.all([
      f.send({type:'set',key:'first',value:1},f.panel),
      f.send({type:'set',key:'second',value:2},f.panel),
      f.send({type:'live',text:'live transcript'}),
      f.send({type:'status',status:'listening',mic:true})
    ]);
    assert.ok(responses.every(r=>r.ok));
    assert.deepEqual(f.data.state,{first:1,second:2});
    assert.equal(f.data.view.heard,'live transcript');assert.equal(f.data.view.mic,true);
    assert.equal(f.data.view.connected,true);assert.equal(f.data.view.tabId,7);
  }finally{f.restore();}
});
test('Options opened in a tab can load and save settings',{timeout:2000},async()=>{
  const f=await fixture();
  try{
    const sender={id:'test-extension',tab:{id:99},url:'chrome-extension://test-extension/options/index.html'};
    const loaded=await f.send({type:'get'},sender);assert.equal(loaded.ok,true);assert.ok(loaded.data.options);
    const saved=await f.send({type:'digest',text:'New digest'},sender);assert.equal(saved.ok,true);assert.equal(f.data.digest,'New digest');
    assert.equal(f.data.view.tabId,7);
  }finally{f.restore();}
});
test('newest Forge session takes over and older sessions cannot reclaim it',{timeout:2000},async()=>{
  const f=await fixture();
  try{
    await f.send({type:'ready',isGM:true,sid:'old',startedAt:1000});
    const newer={...f.page,tab:{id:8}};
    const response=await f.send({type:'ready',isGM:true,sid:'new',startedAt:2000},newer);
    assert.equal(response.data.type,'configure');assert.equal(f.data.view.tabId,8);
    assert.ok(f.sent.some(m=>m.id===7&&m.type==='deactivate'&&m.reason==='newer-tab'));
    const rejected=await f.send({type:'ready',isGM:true,sid:'old',startedAt:1000});
    assert.equal(rejected.data.type,'deactivate');assert.equal(f.data.view.tabId,8);
    const actions=f.sent.filter(m=>m.type==='execute').length;
    await f.send({type:'transcript',sid:'old',cueId:'bath'});
    assert.equal(f.sent.filter(m=>m.type==='execute').length,actions);
    await f.send({type:'transcript',sid:'new',cueId:'bath'},newer);
    assert.equal(f.sent.filter(m=>m.type==='execute').length,actions+1);
    const entries=(await f.send({type:'getLog'},f.panel)).data;
    assert.ok(entries.some(e=>e.ev==='tab-takeover'&&e.from===7&&e.to===8));
    assert.ok(entries.some(e=>e.ev==='message'&&e.dropped&&e.reason==='newer-tab'));
  }finally{f.restore();}
});
test('worker logs drops, routing scores, view transitions and page session ids',{timeout:2000},async()=>{
  const f=await fixture();
  try{
    await f.send({type:'ready',isGM:true,sid:'page-session',startedAt:1000});
    await f.send({type:'log',sid:'page-session',ev:'visibility',details:{visibility:'hidden',apiKey:'must-not-log',body:'must-not-log'}});
    await f.send({type:'transcript',sid:'page-session',alternatives:['scene bath house']});
    await f.send({type:'ping'}, {...f.page,url:'https://untrusted.example/'});
    const entries=(await f.send({type:'getLog'},f.panel)).data;
    assert.ok(entries.some(e=>e.ev==='worker-start'));
    assert.ok(entries.some(e=>e.src==='page'&&e.sid==='page-session'&&e.ev==='visibility'&&e.tab===7));
    assert.ok(entries.some(e=>e.ev==='route'&&e.cueId==='bath'&&e.score>=.82&&e.score<1));
    assert.ok(entries.some(e=>e.ev==='message'&&e.dropped&&e.reason==='wrong-origin'));
    assert.equal(JSON.stringify(entries).includes('must-not-log'),false);
  }finally{f.restore();}
});
test('Options tab can save API settings and clear the event log',{timeout:2000},async()=>{
  const f=await fixture();
  try{
    const sender={id:'test-extension',tab:{id:99},url:'chrome-extension://test-extension/options/index.html'};
    const result=await f.send({type:'options',options:{lang:'fr-FR',threshold:.82,rate:1,extraOrigins:[]},apiKey:'private-key-for-test'},sender);
    assert.equal(result.ok,true);assert.equal(f.data.options.lang,'fr-FR');assert.equal(f.data.apiKey,'private-key-for-test');
    const entries=(await f.send({type:'getLog'},sender)).data;assert.equal(JSON.stringify(entries).includes('private-key-for-test'),false);
    assert.equal((await f.send({type:'clearLog'},sender)).ok,true);assert.deepEqual(f.data.log,[]);
  }finally{f.restore();}
});
