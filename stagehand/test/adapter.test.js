import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdapter} from '../src/main-world/foundryAdapter.js';
function setup(){
  const calls=[];let volume=.65;
  const collection=items=>({get:id=>items.find(x=>x.id===id),getName:name=>items.find(x=>x.name===name)});
  const scene={id:'scene',name:'Bathhouse',active:false,activate:async()=>{calls.push('activate');}};
  const sound={id:'sound',name:'Track'};
  const playlist={id:'playlist',name:'Satie',sounds:collection([sound]),playAll:async()=>calls.push('playlist'),playSound:async s=>calls.push(['sound',s.id]),stopAll:async()=>calls.push('stopPlaylist')};
  const game={version:'14.368',user:{id:'gm',isGM:true},scenes:collection([scene]),playlists:{...collection([playlist]),playing:[playlist]},settings:{settings:new Map([['core.globalPlaylistVolume',{scope:'client'}]]),get:()=>volume,set:async(namespace,key,value)=>{calls.push(['volume',namespace,key,value]);volume=value;}},audio:{playing:new Map([[1,{stop:async()=>calls.push('stopLocal')} ]])}};
  class Roll{
    static validate(formula){return formula==='1d100';}
    constructor(formula){this.formula=formula;this.total=73;this.result='73';}
    async evaluate(options){calls.push(['evaluate',options]);return this;}
    async toMessage(data,options){calls.push(['message',data,options]);}
  }
  class ImagePopout{constructor(options){calls.push(['image',options]);}shareImage(options){calls.push(['share',options]);}async close(){calls.push('closeImage');}}
  const foundry={dice:{Roll},applications:{apps:{ImagePopout}},audio:{AudioHelper:{play:(data,broadcast)=>calls.push(['oneShot',data,broadcast])}}};
  const config={ChatMessage:{modes:{selfroll:{}}}};
  const adapter=createAdapter({getGame:()=>game,getFoundry:()=>foundry,getConfig:()=>config});
  return{adapter,game,calls,scene,config,getVolume:()=>volume};
}
test('player sessions cannot activate or perform actions',async()=>{const{adapter,game,calls}=setup();game.user.isGM=false;await assert.rejects(adapter.enable(),/requires a GM/);await assert.rejects(adapter.runAction({type:'scene',name:'Bathhouse'}),/requires a GM/);assert.equal(calls.length,0);});
test('unsupported versions and non-client volume settings fail closed',async()=>{const{adapter,game,calls}=setup();game.version='13.350';await assert.rejects(adapter.enable(),/requires Foundry v14/);game.version='14.368';game.settings.settings.get('core.globalPlaylistVolume').scope='world';await assert.rejects(adapter.enable(),/client-local/);assert.equal(calls.length,0);});
test('enable mutes only the client; repeated enable preserves original volume',async()=>{const{adapter,calls,getVolume}=setup();await adapter.enable();await adapter.enable();assert.equal(getVolume(),0);await adapter.disable();await adapter.disable();assert.equal(getVolume(),.65);assert.deepEqual(calls,[['volume','core','globalPlaylistVolume',0],['volume','core','globalPlaylistVolume',.65]]);});
test('actions require activation and GM role at execution time',async()=>{const{adapter,game}=setup();await assert.rejects(adapter.runAction({type:'stop_all'}),/disabled/);await adapter.enable();game.user.isGM=false;await assert.rejects(adapter.roll('1d100'),/requires a GM/);await adapter.disable();});
test('scene actions activate by name or id and leave active scenes alone',async()=>{const{adapter,scene,calls}=setup();await adapter.enable();await adapter.runAction({type:'scene',id:'scene'});scene.active=true;assert.deepEqual(await adapter.runAction({type:'scene',name:'Bathhouse'}),{already:true});assert.equal(calls.filter(c=>c==='activate').length,1);await assert.rejects(adapter.runAction({type:'scene',name:'Missing'}),/not found/);});
test('playlist and track actions use verified v14 signatures',async()=>{const{adapter,calls}=setup();await adapter.enable();await adapter.runAction({type:'playlist',name:'Satie'});await adapter.runAction({type:'sound',playlist:'Satie',name:'Track'});assert.ok(calls.includes('playlist'));assert.ok(calls.some(c=>Array.isArray(c)&&c[0]==='sound'&&c[1]==='sound'));});
test('stop all awaits playlist stops and reports remote sound limitation',async()=>{const{adapter,calls}=setup();await adapter.enable();const result=await adapter.runAction({type:'stop_all'});assert.ok(calls.includes('stopPlaylist'));assert.ok(calls.includes('stopLocal'));assert.match(result.warning,/Remote non-playlist/);});
test('broadcast one-shots use muted music channel and explicit autoplay',async()=>{const{adapter,calls}=setup();await adapter.enable();await adapter.runAction({type:'oneshot',src:'sounds/bell.wav'});assert.deepEqual(calls.at(-1),['oneShot',{src:'sounds/bell.wav',volume:1,loop:false,autoplay:true,channel:'music'},true]);});
test('handouts use v14 options constructor and public share API',async()=>{const{adapter,calls}=setup();await adapter.enable();await adapter.runAction({type:'handout',src:'portrait.webp',title:'Portrait'});assert.deepEqual(calls.at(-2),['image',{src:'portrait.webp',window:{title:'Portrait'}}]);assert.deepEqual(calls.at(-1),['share',{image:'portrait.webp',title:'Portrait',showTitle:true}]);const result=await adapter.runAction({type:'hide_handout'});assert.ok(calls.includes('closeImage'));assert.match(result.warning,/does not expose remote/);});
test('rolls explicitly whisper only to the acting GM and use messageMode',async()=>{const{adapter,calls}=setup();await adapter.enable();assert.deepEqual(await adapter.roll('1d100'),{total:73,result:'73'});assert.deepEqual(calls.at(-1),['message',{flavor:'Stagehand',whisper:['gm'],blind:false},{messageMode:'selfroll'}]);assert.deepEqual(calls.at(-2),['evaluate',{allowInteractive:false}]);await assert.rejects(adapter.roll('invalid'),/Not a roll/);});
test('missing selfroll visibility mode blocks chat creation',async()=>{const{adapter,config,calls}=setup();await adapter.enable();delete config.ChatMessage.modes.selfroll;await assert.rejects(adapter.roll('1d100'),/unavailable/);assert.equal(calls.length,1);});
test('scene validation reports missing scene and black-scene names',async()=>{const{adapter}=setup();assert.deepEqual(await adapter.validateScenes({black_scene:'Black',cues:[{actions:[{type:'scene',name:'Missing'}]}]}),['Scene not found: Missing','Black scene not found: Black']);});
test('pending cue waits can be cancelled by panic',async()=>{const{adapter}=setup();await adapter.enable();const controller=new AbortController();const waiting=adapter.runAction({type:'wait',ms:30000},{signal:controller.signal});controller.abort();await assert.rejects(waiting,{name:'AbortError'});});
