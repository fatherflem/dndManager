import * as adapter from './foundryAdapter.js';
import {speak,configureTTS} from './tts.js';
import {createSpeech} from './speech.js';
import {bindHotkeys} from './hotkeys.js';
import {withTimeout} from '../shared/timeout.js';
if(!window.__stagehandInstalled){
  window.__stagehandInstalled=true;
  const tag='stagehand-v1';let options={pttKey:'F13'},sheet={cues:[]},active=false,unbind,lastHeartbeat=Date.now(),generation=0,controller=new AbortController(),execution=Promise.resolve();
  const emit=payload=>window.postMessage({tag,direction:'to-extension',payload},location.origin);
  const speech=createSpeech({getOptions:()=>options,emit,speak,allowed:()=>active&&adapter.isGM()});
  window.addEventListener('message',async event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.tag!==tag||event.data.direction!=='to-page'||!adapter.isGM())return;
    const msg=event.data.payload;if(!msg)return;
    if(msg.type==='heartbeat'){lastHeartbeat=Date.now();return;}
    if(msg.type==='configure'){
      options=msg.options;sheet=msg.sheet;configureTTS(options);
      try{await withTimeout(adapter.enable());active=true;lastHeartbeat=Date.now();unbind?.();unbind=bindHotkeys(()=>({options,sheet}),{start:()=>speech.start(),stop:speech.stop,cue:id=>emit({type:'transcript',alternatives:[],cueId:id})});emit({type:'status',status:'idle',mic:false,sceneErrors:await adapter.validateScenes(sheet)});}
      catch(error){active=false;emit({type:'status',status:'error',error:error.message,mic:false});}
      return;
    }
    if(msg.type==='speak'){speak(msg.text);return;}
    if(msg.type==='toggle'){speech.toggle();return;}
    if(msg.type==='execute'){
      const command=msg.command;
      if(command.urgent){controller.abort();controller=new AbortController();generation++;execution=Promise.resolve();}
      const ownGeneration=generation,signal=controller.signal;
      execution=execution.then(async()=>{
      try{
        if(ownGeneration!==generation)return;
        if(!active)throw new Error(adapter.adapterStatus);
        if(command.type==='roll'){const result=await withTimeout(adapter.roll(command.formula));emit({type:'result',total:result.total,named:command.named,spoken:`${command.formula}: ${result.total}.`,detail:`${command.formula} = ${result.result} = ${result.total}`});}
        else if(command.type==='hide_handout'){const result=await withTimeout(adapter.runAction({type:'hide_handout'},{signal}));emit({type:'result',spoken:'Handout hidden.',detail:result.warning});}
        else{
          let already=false;const warnings=[],errors=[];
          for(const action of command.actions??[]){try{const result=await withTimeout(adapter.runAction(action,{signal}),action.type==='wait'?action.ms+1000:8000);already=result?.already||already;if(result?.warning)warnings.push(result.warning);}catch(error){if(!command.urgent)throw error;errors.push(error.message);}}
          emit({type:'result',cueId:command.cueId,spoken:already?'Already there.':command.label,detail:[command.label,...warnings].join('\n'),...(errors.length?{error:errors.join('\n')}:{})});
        }
      }catch(error){if(!signal.aborted)emit({type:'result',cueId:command.cueId,error:error.message});}
      });
    }
  });
  const poll=setInterval(async()=>{
    if(active&&(!adapter.isGM()||Date.now()-lastHeartbeat>10000)){active=false;controller.abort();controller=new AbortController();generation++;speech.abort();unbind?.();try{await adapter.disable();}catch(error){emit({type:'status',status:'error',error:error.message});}emit({type:'status',status:'idle',mic:false,connected:false});}
    if(!adapter.isGM())return;
    if(active)emit({type:'ping'});
    if(!active)emit({type:'ready',isGM:true,adapter:adapter.adapterStatus,sceneErrors:await adapter.validateScenes(sheet)});
  },2000);
  window.addEventListener('pagehide',()=>{clearInterval(poll);controller.abort();speech.abort();unbind?.();adapter.disable().catch(()=>{});});
}
