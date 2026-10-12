import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSpeech} from '../src/main-world/speech.js';
test('hold recognition results wait for release even if Chrome ends early',()=>{
  const messages=[];let instance;
  const previous=globalThis.webkitSpeechRecognition;
  class Recognition{constructor(){instance=this;}start(){}stop(){this.onend();}abort(){this.onend();}}
  globalThis.webkitSpeechRecognition=Recognition;
  try{
    const speech=createSpeech({getOptions:()=>({lang:'en-US'}),emit:m=>messages.push(m),speak:()=>{},allowed:()=>true});
    speech.start();const result=Object.assign([{transcript:'next scene'}],{isFinal:true});instance.onresult({results:[result]});instance.onend();
    assert.equal(messages.filter(m=>m.type==='transcript').length,0);
    speech.stop();speech.stop();assert.deepEqual(messages.filter(m=>m.type==='transcript'),[{type:'transcript',alternatives:['next scene']}]);
  }finally{globalThis.webkitSpeechRecognition=previous;}
});
test('an inert player session never creates a speech recognizer',()=>{
  let created=false;const previous=globalThis.webkitSpeechRecognition;
  globalThis.webkitSpeechRecognition=class{constructor(){created=true;}};
  try{createSpeech({getOptions:()=>({}),emit:()=>{},speak:()=>{},allowed:()=>false}).start();assert.equal(created,false);}finally{globalThis.webkitSpeechRecognition=previous;}
});
