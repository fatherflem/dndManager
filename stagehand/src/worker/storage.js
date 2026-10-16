export const defaults={lang:'en-US',pttKey:'F13',threshold:.82,rate:1,voice:'',model:'claude-haiku-4-5',extraOrigins:[]};
export async function load(){const data=await chrome.storage.local.get(['options','sheet','state','view','digest','apiKey','history','lastSpoken']);return{...data,options:{...defaults,...data.options},sheet:data.sheet??{version:1,cues:[],state:{}},state:data.state??{},view:data.view??{status:'idle',connected:false,heard:'',did:''}};}
let writes=Promise.resolve();
let viewObserver=()=>{};
export function observeView(observer){viewObserver=observer;}
// Read and write inside the same queue slot, so decisions and merges use the
// latest committed data. Never put network requests in this queue.
export function mutate(update){
  const operation=writes.then(async()=>{const data=await load(),{patch,result}=update(data);if(patch){await chrome.storage.local.set(patch);if(patch.view)try{viewObserver(data.view,patch.view);}catch{/* Diagnostics must never break a write. */}}return result;});
  writes=operation.catch(()=>{});return operation;
}
export function save(patch){return mutate(data=>({patch:{...patch,...(patch.view?{view:{...data.view,...patch.view}}:{}),...(patch.state?{state:{...data.state,...patch.state}}:{})}}));}
export function publicData(data){return{options:data.options,sheet:data.sheet,state:data.state,view:data.view,digestSize:(data.digest??'').length};}
