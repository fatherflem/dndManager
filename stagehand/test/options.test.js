import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('Options reports an empty get response instead of silently showing blank fields',async()=>{
  const nodes=new Map();const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',replaceChildren(){},append(){}});return nodes.get(id);};
  const context={crypto,document:{getElementById:element},Option:function(){},speechSynthesis:{getVoices:()=>[]},chrome:{runtime:{sendMessage:async()=>({ok:true})},storage:{onChanged:{addListener(){}}}}};
  vm.runInNewContext(await readFile(new URL('../src/options/index.js',import.meta.url),'utf8'),context);
  await new Promise(setImmediate);
  assert.match(element('message').textContent,/returned no settings/);assert.equal(element('model').value,'');
});
