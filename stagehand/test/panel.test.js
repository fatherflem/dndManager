import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
test('Panel displays newest 25 logs and log storage updates do not cause a read/write feedback loop',async()=>{
  const bundle=await build({entryPoints:[new URL('../src/panel/index.js',import.meta.url).pathname],bundle:true,write:false,format:'iife'});
  const entries=Array.from({length:400},(_,i)=>({ev:String(i)})),calls=[],nodes=new Map();let changed,copied;
  const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',replaceChildren(){},append(){},contains:()=>false});return nodes.get(id);};
  const context={crypto,document:{getElementById:element,querySelectorAll:()=>[]},navigator:{clipboard:{writeText:async text=>copied=text}},chrome:{runtime:{sendMessage:async msg=>{calls.push(msg);return{ok:true,data:msg.type==='getLog'?entries:msg.type==='get'?{view:{status:'idle'},sheet:{cues:[],state:{}},state:{}}:undefined};}},storage:{onChanged:{addListener:fn=>changed=fn}}}};
  vm.runInNewContext(bundle.outputFiles[0].text,context);await new Promise(setImmediate);
  const lines=element('log-entries').textContent.split('\n').map(JSON.parse);assert.equal(lines.length,25);assert.equal(lines[0].ev,'399');assert.equal(lines.at(-1).ev,'375');
  const before=calls.length;changed({log:{newValue:entries}});await new Promise(setImmediate);assert.equal(calls.length,before);
  await element('copy-log').onclick();assert.equal(JSON.parse(copied).length,300);assert.equal(JSON.parse(copied)[0].ev,'100');assert.match(element('error').textContent,/copied/);
});
