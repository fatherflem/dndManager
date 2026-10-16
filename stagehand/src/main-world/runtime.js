import {bindHotkeys} from './hotkeys.js';
import {createSpeech} from './speech.js';
import {withTimeout} from '../shared/timeout.js';
export function startStagehand({win,doc,adapter,speak,configureTTS,now=Date.now,setPoll=setInterval,clearPoll=clearInterval,sid=crypto.randomUUID()}){
  const tag='stagehand-v1',startedAt=now();
  let options={pttKey:'F13'},sheet={cues:[]},active=false,superseded=false,closed=false,unbind,lastHeartbeat=now(),timedOut=false,generation=0,controller=new AbortController(),execution=Promise.resolve(),configuring=Promise.resolve(),ownerEpoch=0;
  const emit=payload=>win.postMessage({tag,direction:'to-extension',payload:{...payload,sid}},win.location.origin);
  const log=(ev,details={})=>emit({type:'log',ev,details});
  const speech=createSpeech({getOptions:()=>options,emit,speak,log,allowed:()=>active&&adapter.isGM()&&!closed});
  log('load',{version:String(win.game?.version??'not-ready'),isGM:adapter.isGM(),visibility:doc.visibilityState});
  function bind(){unbind?.();unbind=bindHotkeys(()=>({options,sheet}),{start:()=>speech.start(),stop:speech.stop,cue:cueId=>emit({type:'transcript',alternatives:[],cueId}),log},win);}
  function cancel(){active=false;generation++;controller.abort();controller=new AbortController();execution=Promise.resolve();speech.abort();unbind?.();unbind=undefined;}
  async function deactivate(reason,restore=true){
    log('deactivate',{reason});cancel();
    if(restore){try{await adapter.disable();log('disable',{reason,ok:true});}catch(error){log('disable',{reason,ok:false,error:error.message});}}
    else{adapter.relinquish();superseded=true;}
    emit({type:'status',status:reason==='newer-tab'?'inactive':'idle',mic:false,connected:false});
  }
  function requestConnection(reason){
    if(closed||!adapter.isGM())return;
    log('reconnect',{reason,elapsedMs:now()-lastHeartbeat});
    emit({type:'ready',startedAt,isGM:true,adapter:adapter.adapterStatus});emit({type:'ping'});
  }
  async function measure(type,name,run){
    const start=now();
    try{const result=await run();log('action',{type,name,duration:now()-start,ok:true});return result;}
    catch(error){log('action',{type,name,duration:now()-start,ok:false,error:error.message});throw error;}
  }
  async function receive(event){
    if(event.source!==win||event.origin!==win.location.origin||event.data?.tag!==tag||event.data.direction!=='to-page')return;
    const msg=event.data.payload;if(!msg)return;
    if(['configure','deactivate'].includes(msg.type)&&Number.isFinite(msg.epoch)){if(msg.epoch<ownerEpoch){log('stale-control',{type:msg.type,reason:'newer-owner'});return;}ownerEpoch=msg.epoch;}
    if(msg.type==='shutdown'){closed=true;await deactivate(msg.reason??'extension-off');return;}
    if(msg.type==='deactivate'){if(superseded&&!active)return;await deactivate(msg.reason??'newer-tab',false);return;}
    if(closed||!adapter.isGM())return;
    if(msg.type==='heartbeat'){lastHeartbeat=now();timedOut=false;return;}
    if(msg.type==='configure'){
      log('configure');options=msg.options;sheet=msg.sheet;configureTTS(options);
      const ownGeneration=generation;
      configuring=configuring.then(async()=>{
        if(closed||ownGeneration!==generation)return;
        try{
          await withTimeout(adapter.enable());
          if(closed||ownGeneration!==generation){if(superseded)adapter.relinquish();else await adapter.disable();return;}
          active=true;superseded=false;lastHeartbeat=now();timedOut=false;bind();log('enable',{ok:true});
          emit({type:'status',status:'idle',mic:false,sceneErrors:await adapter.validateScenes(sheet)});
        }catch(error){active=false;log('enable',{ok:false,error:error.message});emit({type:'status',status:'error',error:error.message,mic:false});}
      });
      await configuring;return;
    }
    if(msg.type==='speak'){if(active)speak(msg.text);return;}
    if(msg.type==='toggle'){speech.toggle();return;}
    if(msg.type!=='execute')return;
    const command=msg.command;
    if(command.urgent){controller.abort();controller=new AbortController();generation++;execution=Promise.resolve();}
    const ownGeneration=generation,signal=controller.signal;
    execution=execution.then(async()=>{
      try{
        if(ownGeneration!==generation)return;
        if(!active)throw new Error('Stagehand is inactive in this tab.');
        if(command.type==='roll'){
          const result=await measure('roll',command.label??command.formula,()=>withTimeout(adapter.roll(command.formula)));
          emit({type:'result',total:result.total,named:command.named,spoken:`${command.formula}: ${result.total}.`,detail:`${command.formula} = ${result.result} = ${result.total}`});
        }else if(command.type==='hide_handout'){
          const result=await measure('hide_handout','',()=>withTimeout(adapter.runAction({type:'hide_handout'},{signal})));
          emit({type:'result',spoken:'Handout hidden.',detail:result.warning});
        }else{
          let already=false;const warnings=[],errors=[];
          for(const action of command.actions??[]){
            try{const result=await measure(action.type,action.name??action.id??action.src??'',()=>withTimeout(adapter.runAction(action,{signal}),action.type==='wait'?action.ms+1000:8000));already=result?.already||already;if(result?.warning)warnings.push(result.warning);}
            catch(error){if(!command.urgent)throw error;errors.push(error.message);}
          }
          emit({type:'result',cueId:command.cueId,spoken:already?'Already there.':command.label,detail:[command.label,...warnings].join('\n'),...(errors.length?{error:errors.join('\n')}:{})});
        }
      }catch(error){if(!signal.aborted)emit({type:'result',cueId:command.cueId,error:error.message});}
    });
    await execution;
  }
  async function poll(){
    if(closed)return;
    if(!adapter.isGM()){if(active)await deactivate('not-gm');return;}
    if(active){
      if(!doc.hidden&&now()-lastHeartbeat>45000&&!timedOut){
        timedOut=true;log('deactivate',{reason:'heartbeat-timeout',elapsedMs:now()-lastHeartbeat});
        // Keep keys bound and music muted while reconnecting. A delayed timer is
        // not evidence that the extension was turned off.
        emit({type:'status',status:'reconnecting',mic:false});requestConnection('heartbeat-timeout');
      }
      emit({type:'ping'});
    }else if(!superseded)requestConnection('poll');
  }
  const visibility=()=>{log('visibility',{visibility:doc.visibilityState});if(!doc.hidden)requestConnection('visible');};
  win.addEventListener('message',event=>{void receive(event).catch(error=>log('page-error',{error:error.message}));});
  win.addEventListener('focus',()=>{log('focus');if(!doc.hidden)requestConnection('focus');});
  win.addEventListener('blur',()=>log('blur'));
  doc.addEventListener('visibilitychange',visibility);
  const interval=setPoll(()=>{void poll().catch(error=>log('page-error',{error:error.message}));},2000);
  win.addEventListener('pagehide',()=>{closed=true;clearPoll(interval);void deactivate('pagehide');});
  requestConnection('load');
  return{receive,poll,visibility,shutdown:async()=>{closed=true;clearPoll(interval);await deactivate('extension-off');}};
}
