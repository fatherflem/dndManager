import {load,save,mutate,observeView,publicData} from './storage.js';
import {lookup} from './claude.js';
import {routeAlternatives} from '../shared/grammar.js';
import {substitute,bandFor} from '../shared/dice.js';
import {parseSheet} from '../shared/cuesheet.js';
import {createLogger} from './log.js';
const workerSid=crypto.randomUUID();
const logger=createLogger({storage:chrome.storage.local});
const log=(ev,details={},sender)=>logger.record({src:'worker',sid:sender?.sid??workerSid,tab:sender?.tab?.id??null,ev},details);
log('worker-start');
observeView((before,after)=>{for(const key of ['tabId','connected'])if(before[key]!==after[key])log('view-change',{name:key,from:before[key]??null,to:after[key]??null,tabId:after.tabId??null});});
const trustedUI=sender=>sender.id===chrome.runtime.id&&[chrome.runtime.getURL('panel/index.html'),chrome.runtime.getURL('options/index.html')].includes(sender.url);
const trustedOptions=sender=>trustedUI(sender)&&sender.url===chrome.runtime.getURL('options/index.html');
async function page(tabId,payload){try{if(!Number.isInteger(tabId))throw new Error('No GM Foundry tab connected.');await chrome.tabs.sendMessage(tabId,{target:'page',...payload});}catch(error){log('page-send-fail',{tabId,type:payload.type,error:error.message});throw error;}}
async function updateView(patch){await save({view:patch});}
let pendingLookup;
async function runLookup(question,data,onResult,onError){
  pendingLookup?.controller.abort();
  const job={controller:new AbortController()};pendingLookup=job;
  try{
    const result=await lookup(question,data,fetch,{signal:job.controller.signal});
    if(pendingLookup!==job)return;
    return onResult?await onResult(result):result;
  }catch(error){
    if(pendingLookup!==job)return;
    if(onError)return await onError(error);
    throw error;
  }finally{if(pendingLookup===job)pendingLookup=undefined;}
}
async function execute(command,data){
  const tabId=data.view.tabId;
  if(command.type==='set'){await mutate(current=>{if(!(command.key in (current.sheet.state??{}))||!Number.isFinite(command.value))throw new Error('Invalid state.');return{patch:{state:{...current.state,[command.key]:command.value}}};});await page(tabId,{type:'speak',text:`${command.key.replaceAll('_',' ')} ${command.value}.`});await updateView({did:`Set ${command.key} to ${command.value}`});return;}
  if(command.type==='lookup'){
    await updateView({status:'lookup',heard:command.question,did:'No cue matched.'});
    await runLookup(command.question,data,async result=>{await save({history:result.history,lastSpoken:result.spoken});await updateView({status:'idle',lookup:{question:command.question,answer:result.answer}});await page(tabId,{type:'speak',text:result.spoken});},async error=>{const text=error.name==='TimeoutError'?'Lookup timed out.':'Couldn’t look that up.';await updateView({status:'error',did:error.message});await page(tabId,{type:'speak',text});});return;
  }
  if(command.type==='repeat'){await page(tabId,{type:'speak',text:data.lastSpoken??'Nothing to repeat.'});return;}
  if(command.type==='invalid_roll'){await page(tabId,{type:'speak',text:'Not a roll.'});await updateView({did:'Not a roll.'});return;}
  if(command.type==='next'||command.type==='previous'){
    const cue=await mutate(current=>{
      const cues=current.sheet.cues.filter(c=>c.actions.some(a=>a.type==='scene'));
      const index=cues.findIndex(c=>c.id===(current.view.navigationCue??current.view.currentCue));
      const next=cues[command.type==='next'?index+1:index-1];
      return{patch:next?{view:{...current.view,navigationCue:next.id}}:undefined,result:next};
    });
    if(!cue){await page(tabId,{type:'speak',text:'No more scenes.'});return;}command={type:'cue',cue,reserved:true};
  }
  if(command.type==='named_roll'){const r=command.roll;command={type:'roll',formula:substitute(r.formula,{...data.sheet.state,...data.state}),named:{speak:r.speak,bands:r.bands},label:r.id};}
  if(command.type==='panic')command={type:'actions',actions:[{type:'stop_all'},{type:'scene',name:data.sheet.black_scene}],label:'Panic',urgent:true};
  if(command.type==='stop_all')command={type:'actions',actions:[{type:'stop_all'}],label:'Audio killed'};
  if(command.type==='handout')command={type:'actions',actions:[{type:'handout',...command.handout}],label:command.handout.id};
  if(command.type==='cue'){
    if(!command.reserved)await updateView({navigationCue:command.cue.id});
    command={type:'actions',actions:command.cue.actions,label:command.cue.label??command.cue.id,cueId:command.cue.id};
  }
  try{await page(tabId,{type:'execute',command});}catch(error){await rollbackCue(command.cueId);throw error;}
}
async function rollbackCue(cueId){if(cueId)await mutate(data=>({patch:data.view.navigationCue===cueId?{view:{...data.view,navigationCue:data.view.currentCue??null}}:undefined}));}
async function handle(msg,sender){
  const data=await load();logger.setSecrets(data.apiKey,data.digest);
  const kind=trustedUI(sender)?(trustedOptions(sender)?'options':'panel'):'page';
  const incoming={kind,type:msg.type,tabId:sender.tab?.id??null};
  const drop=reason=>{log('message',{...incoming,dropped:true,reason},sender);};
  const accept=()=>log('message',{...incoming,dropped:false},sender);
  if(sender.tab&&!String(sender.url).startsWith(chrome.runtime.getURL(''))){
    let origin;try{origin=new URL(sender.url).origin;}catch{drop('invalid-origin');return;}
    if(sender.id!==chrome.runtime.id||!(new URL(origin).hostname.endsWith('.forge-vtt.com')&&new URL(origin).protocol==='https:'||data.options.extraOrigins.includes(origin))){drop('wrong-origin');return;}
    if(!['log','ready','ping','transcript','live','status','result'].includes(msg.type)){drop('unknown-type');return;}
    if(msg.type==='log'){accept();logger.record({src:'page',sid:msg.sid,tab:sender.tab.id,ev:msg.ev},msg.details);return;}
    if(msg.type==='ready'){
      if(!msg.isGM){drop('not-gm');return;}
      const ownership=await mutate(current=>{
        const startedAt=Number.isFinite(msg.startedAt)?msg.startedAt:Date.now();
        if(current.view.connected&&current.view.tabId!==sender.tab.id&&(current.view.ownerStartedAt??0)>startedAt)return{result:{accepted:false,epoch:current.view.ownerEpoch??0}};
        return{patch:{view:{...current.view,connected:true,tabId:sender.tab.id,ownerSid:msg.sid??null,ownerStartedAt:startedAt,ownerEpoch:(current.view.ownerEpoch??0)+(current.view.tabId!==sender.tab.id||current.view.ownerSid!==msg.sid?1:0),status:'idle',adapter:msg.adapter,sceneErrors:msg.sceneErrors??[]}},result:{accepted:true,previousTab:current.view.tabId,epoch:(current.view.ownerEpoch??0)+(current.view.tabId!==sender.tab.id||current.view.ownerSid!==msg.sid?1:0)}};
      });
      if(!ownership.accepted){drop('newer-tab');return{type:'deactivate',reason:'newer-tab',epoch:ownership.epoch};}
      accept();
      if(Number.isInteger(ownership.previousTab)&&ownership.previousTab!==sender.tab.id){pendingLookup?.controller.abort();pendingLookup=undefined;log('tab-takeover',{from:ownership.previousTab,to:sender.tab.id},sender);void page(ownership.previousTab,{type:'deactivate',reason:'newer-tab',epoch:ownership.epoch}).catch(()=>{});}
      return{type:'configure',epoch:ownership.epoch,options:data.options,sheet:data.sheet};
    }
    if(data.view.tabId!==sender.tab.id){drop('tab-id-mismatch');return msg.type==='ping'||msg.type==='transcript'?{type:'deactivate',reason:'newer-tab',epoch:data.view.ownerEpoch??0}:undefined;}
    if(data.view.ownerSid&&msg.sid!==data.view.ownerSid){drop('session-mismatch');return;}
    accept();
    if(msg.type==='ping')return{type:'heartbeat'};
    if(msg.type==='transcript'){if(msg.cueId){const cue=data.sheet.cues.find(c=>c.id===msg.cueId);if(cue){log('route',{type:'cue',cueId:cue.id,score:1},sender);await execute({type:'cue',cue},data);}}else{await updateView({heard:msg.alternatives?.[0]??''});await execute(routeAlternatives(msg.alternatives??[],data.sheet,data.options.threshold,details=>log('route',details,sender)),await load());}}
    if(msg.type==='live')await updateView({heard:msg.text});
    if(msg.type==='status')await updateView({status:msg.status,...(msg.mic!==undefined?{mic:msg.mic}:{}),...(msg.error?{did:msg.error}:{}),...(msg.connected===false?{connected:false}:{}),...(Array.isArray(msg.sceneErrors)?{sceneErrors:msg.sceneErrors}:{})});
    if(msg.type==='result'){
      if(msg.error)await rollbackCue(msg.cueId);
      let spoken=msg.spoken??'Done.';
      if(msg.named&&Number.isFinite(msg.total))spoken=(msg.named.speak??'Rolled {total}.').replaceAll('{total}',String(msg.total)).replaceAll('{band}',bandFor(msg.total,msg.named.bands));
      await save({lastSpoken:spoken});await updateView({status:msg.error?'error':'idle',did:msg.error??msg.detail??spoken,...(msg.cueId&&!msg.error?{currentCue:msg.cueId}:{})});await page(sender.tab.id,{type:'speak',text:msg.error?"Couldn't do that.":spoken});
    }
    return;
  }
  if(!trustedUI(sender)){drop('untrusted');throw new Error('Untrusted extension message.');}
  if(!['log','getLog','clearLog','get','manual','set','sheet','digest','options','testLookup','testVoice'].includes(msg.type)){drop('unknown-type');return;}
  if(!trustedOptions(sender)&&['clearLog','sheet','digest','options','testLookup','testVoice'].includes(msg.type)){drop('options-required');throw new Error('Options page required.');}
  accept();
  if(msg.type==='log'){logger.record({src:kind,sid:msg.sid,tab:sender.tab?.id??null,ev:msg.ev},msg.details);return;}
  if(msg.type==='getLog')return await logger.flush();
  if(msg.type==='clearLog'){if(!trustedOptions(sender))throw new Error('Options page required.');await logger.clear();return{ok:true};}
  if(msg.type==='get')return publicData(data);
  if(msg.type==='manual'){
    if(msg.cueId){const cue=data.sheet.cues.find(c=>c.id===msg.cueId);if(!cue)throw new Error('Unknown cue.');await execute({type:'cue',cue},data);}
    else if(msg.handoutId){const handout=data.sheet.handouts?.find(c=>c.id===msg.handoutId);if(!handout)throw new Error('Unknown handout.');await execute({type:'handout',handout},data);}
    else if(msg.rollId){const roll=data.sheet.named_rolls?.find(c=>c.id===msg.rollId);if(!roll)throw new Error('Unknown roll.');await execute({type:'named_roll',roll},data);}
    else if(msg.text)await execute(routeAlternatives([msg.text],data.sheet,data.options.threshold,details=>log('route',details,sender)),data);
    else if(['next','previous','panic','stop_all','hide_handout','repeat'].includes(msg.command))await execute({type:msg.command},data);
    return;
  }
  if(msg.type==='set'){if(!(msg.key in (data.sheet.state??{}))||!Number.isFinite(msg.value))throw new Error('Invalid state.');await execute({type:'set',key:msg.key,value:msg.value},data);return;}
  if(!trustedOptions(sender))throw new Error('Options page required.');
  if(msg.type==='sheet'){const sheet=parseSheet(msg.text);await mutate(current=>({patch:{sheet,state:{...sheet.state},view:{...current.view,currentCue:null,navigationCue:null}}}));if(data.view.tabId)await page(data.view.tabId,{type:'configure',options:data.options,sheet});return{ok:true};}
  if(msg.type==='digest'){logger.setSecrets(msg.text);await save({digest:msg.text});return{ok:true};}
  if(msg.type==='options'){
    const options={...data.options,...msg.options};if(!Number.isFinite(options.threshold)||options.threshold<0||options.threshold>1||!Number.isFinite(options.rate)||options.rate<.1||options.rate>10)throw new Error('Invalid threshold or voice rate.');
    logger.setSecrets(msg.apiKey);
    await save({options,...(msg.apiKey?{apiKey:msg.apiKey}:{})});
    const old=await chrome.scripting.getRegisteredContentScripts();if(old.length)await chrome.scripting.unregisterContentScripts({ids:old.map(s=>s.id)});
    if(options.extraOrigins.length)await chrome.scripting.registerContentScripts([{id:'extra-main',matches:options.extraOrigins.map(o=>`${o}/*`),js:['main-world/index.js'],world:'MAIN',runAt:'document_idle'},{id:'extra-bridge',matches:options.extraOrigins.map(o=>`${o}/*`),js:['content/bridge.js'],runAt:'document_idle'}]);
    if(data.view.tabId)await page(data.view.tabId,{type:'configure',options,sheet:data.sheet});return{ok:true};
  }
  if(msg.type==='testLookup'){const result=await runLookup('What rules does this digest cover?',data);return result?{answer:result.answer}:{answer:'Lookup superseded.'};}
  if(msg.type==='testVoice'){await page(data.view.tabId,{type:'speak',text:'Stagehand ready.'});return{ok:true};}
}
let queue=Promise.resolve();
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  // Routing and all lookups run outside the configuration queue. Authentication
  // and fixed-command parsing still happen in handle before any action is sent.
  const immediate=['ping','transcript','manual','set','testLookup','log','getLog','clearLog'].includes(msg.type);
  const operation=immediate?handle(msg,sender):queue.then(()=>handle(msg,sender));if(!immediate)queue=operation.catch(()=>{});
  operation.then(result=>respond({ok:true,data:result})).catch(async error=>{log('message-error',{type:msg.type,error:error.message},sender);await updateView({status:'error',did:error.message});respond({ok:false,error:error.message});});return true;
});
chrome.commands.onCommand.addListener(async command=>{if(command==='toggle-talk'){try{const data=await load();await page(data.view.tabId,{type:'toggle'});}catch(error){await updateView({status:'error',did:error.message});}}});
chrome.tabs.onRemoved.addListener(async tabId=>{await mutate(data=>({patch:data.view.tabId===tabId?{view:{...data.view,connected:false,tabId:null,mic:false}}:undefined}));});
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(()=>{});
