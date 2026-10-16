// Worker-owned, independently batched storage. Logging never joins the cue/write queue.
const fields=new Set(['type','kind','dropped','reason','from','to','tabId','connected','version','isGM','visibility','error','key','cueId','transcript','duration','ok','action','name','score','secondScore','threshold','margin','elapsedMs','status','count','alternative']);
export function createLogger({storage,now=()=>new Date(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let pending=[],timer,queue=Promise.resolve(),epoch=0;const secrets=new Set();
  function setSecrets(...values){for(const value of values)if(typeof value==='string'&&value)secrets.add(value);}
  function clean(value){
    if(typeof value==='string'){
      for(const secret of [...secrets].sort((a,b)=>b.length-a.length))value=value.replaceAll(secret,'[REDACTED]');
      return value.replace(/sk-ant-[a-z0-9_-]+/gi,'[REDACTED]').replace(/(x-api-key|authorization)\s*[:=]\s*\S+/gi,'$1: [REDACTED]').slice(0,4000);
    }
    return typeof value==='boolean'||value===null||typeof value==='number'&&Number.isFinite(value)?value:undefined;
  }
  function entry(input){
    const result={t:clean(input.t),src:['worker','page','panel','options'].includes(input.src)?input.src:'worker',sid:clean(input.sid??null),tab:Number.isInteger(input.tab)?input.tab:null,ev:clean(String(input.ev??'unknown').slice(0,80))};
    for(const [key,value]of Object.entries(input))if(fields.has(key)){const safe=clean(value);if(safe!==undefined)result[key]=safe;}
    return result;
  }
  function schedule(){if(!timer&&pending.length)timer=setTimer(()=>{timer=undefined;void flush().catch(()=>{});},500);}
  function record(meta,details={}){
    pending.push(entry({...details,...meta,t:now().toISOString()}));pending=pending.slice(-1000);
    if(pending.length>=50)void flush().catch(()=>{});else schedule();
  }
  function flush(){
    if(timer){clearTimer(timer);timer=undefined;}
    const batch=pending,generation=epoch;pending=[];
    const operation=queue.then(async()=>{
      const saved=await storage.get(['log','apiKey','digest']);setSecrets(saved.apiKey,saved.digest);
      const log=[...(Array.isArray(saved.log)?saved.log:[]),...batch].slice(-1000).map(entry);
      if(batch.length)await storage.set({log});
      return log;
    });
    queue=operation.catch(()=>{if(generation===epoch){pending=[...batch,...pending].slice(-1000);schedule();}});
    return operation;
  }
  async function clear(){
    epoch++;
    if(timer){clearTimer(timer);timer=undefined;}pending=[];
    const operation=queue.then(()=>storage.set({log:[]}));queue=operation.catch(()=>{});await operation;
  }
  return{record,flush,clear,setSecrets};
}
