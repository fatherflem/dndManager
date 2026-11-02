import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lookup} from '../src/worker/claude.js';
const data={apiKey:'test-only',digest:'Rules digest',options:{model:'claude-haiku-4-5'},history:[]};
test('Claude request uses the digest, capped context and a bounded response',async()=>{let request;const result=await lookup('How many?',data,async(url,options)=>{request={url,options,body:JSON.parse(options.body)};return{ok:true,json:async()=>({content:[{type:'text',text:'Three. [Players]'}]})};});assert.equal(request.url,'https://api.anthropic.com/v1/messages');assert.equal(request.body.max_tokens,200);assert.equal(request.body.system[1].cache_control.type,'ephemeral');assert.equal(request.body.system[1].text,'Rules digest');assert.equal(result.spoken,'Three.');assert.equal(result.answer,'Three. [Players]');assert.equal(result.history.length,2);assert.ok(request.options.signal);});
test('Claude access failures preserve useful errors',async()=>{await assert.rejects(lookup('?',data,async()=>({ok:false,status:401})),/401/);await assert.rejects(lookup('?',{...data,apiKey:''}),/API key/);await assert.rejects(lookup('?',{...data,digest:''}),/digest/);});
test('only three completed question and answer pairs are retained',async()=>{const history=Array.from({length:6},(_,i)=>({role:i%2?'assistant':'user',content:String(i)}));const result=await lookup('New question',{...data,history},async()=>({ok:true,json:async()=>({content:[{type:'text',text:'New answer. [Rules]'}]})}));assert.equal(result.history.length,6);assert.equal(result.history[0].content,'2');});

test('lookup duration starts at send and includes response parsing on success',async()=>{
  let clock=0;const measurements=[];
  const result=await lookup('How many?',data,async()=>{assert.equal(clock,0);clock=15;return{ok:true,json:async()=>{clock=42;return{content:[{type:'text',text:'Three.'}]};}};},{now:()=>clock,onComplete:entry=>measurements.push(entry)});
  assert.equal(result.answer,'Three.');assert.deepEqual(measurements,[{duration:42,ok:true}]);
});
test('HTTP, transport, malformed response, timeout and cancellation failures finish timing',async()=>{
  for(const fetcher of [async()=>({ok:false,status:500}),async()=>{throw new TypeError('Network failed');},async()=>({ok:true,json:async()=>{throw new SyntaxError('Invalid JSON');}}),async()=>{throw new DOMException('Timed out','TimeoutError');},async()=>{throw new DOMException('Cancelled','AbortError');}]){
    let clock=10;const measurements=[];
    await assert.rejects(lookup('How many?',data,async(...args)=>{clock=35;return fetcher(...args);},{now:()=>clock,onComplete:entry=>measurements.push(entry)}));
    assert.equal(measurements.length,1);assert.equal(measurements[0].duration,25);assert.equal(measurements[0].ok,false);assert.ok(measurements[0].error);
  }
});
test('missing local credentials do not create a network timing record',async()=>{
  const measurements=[];await assert.rejects(lookup('Question',{...data,apiKey:''},async()=>assert.fail('must not send'),{onComplete:entry=>measurements.push(entry)}));assert.deepEqual(measurements,[]);
});

test('the configured timeout aborts transport and reports elapsed duration',{timeout:2000},async t=>{
  const timeout=AbortSignal.timeout.bind(AbortSignal),measurements=[];
  t.mock.method(AbortSignal,'timeout',ms=>{assert.equal(ms,8000);return timeout(5);});
  // Keep the event loop alive: AbortSignal.timeout itself uses an unref'ed timer.
  const keepAlive=setTimeout(()=>{},1000);
  try{
    await assert.rejects(lookup('Question',data,async(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),{onComplete:entry=>measurements.push(entry)}),{name:'TimeoutError'});
    assert.equal(measurements.length,1);assert.equal(measurements[0].error,'TimeoutError');assert.equal(measurements[0].ok,false);assert.ok(measurements[0].duration>=0);
  }finally{clearTimeout(keepAlive);}
});
