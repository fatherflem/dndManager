import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindHotkeys} from '../src/main-world/hotkeys.js';
test('talk and cue keys ignore typing, repeat and composing; handout hotkeys work',()=>{
  const handlers={},calls=[];
  const unbind=bindHotkeys(()=>({options:{pttKey:'F13'},sheet:{cues:[{id:'scene',hotkey:'F1'}],handouts:[{id:'image',hotkey:'F2'}]}}),{start:()=>calls.push('start'),stop:()=>calls.push('stop'),cue:id=>calls.push(id)},{addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:name=>delete handlers[name]});
  const event=(key,target={},extra={})=>({key,target,ctrlKey:false,altKey:false,shiftKey:false,metaKey:false,preventDefault(){},...extra});
  for(const target of [{tagName:'INPUT'},{tagName:'TEXTAREA'},{tagName:'SELECT'},{isContentEditable:true}])for(const key of ['F13','F1','F2'])handlers.keydown(event(key,target));
  handlers.keydown(event('F13',{}, {repeat:true}));handlers.keydown(event('F13',{}, {isComposing:true}));assert.deepEqual(calls,[]);
  handlers.keydown(event('F13'));handlers.keyup(event('F13'));handlers.keydown(event('F1'));handlers.keydown(event('F2'));handlers.blur();
  assert.deepEqual(calls,['start','stop','scene','image','stop']);unbind();assert.deepEqual(handlers,{});
});
