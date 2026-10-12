export const defaults={lang:'en-US',pttKey:'F13',threshold:.82,rate:1,voice:'',model:'claude-haiku-4-5',extraOrigins:[]};
export async function load(){const data=await chrome.storage.local.get(null);return{...data,options:{...defaults,...data.options},sheet:data.sheet??{version:1,cues:[],state:{}},state:data.state??{},view:data.view??{status:'idle',connected:false,heard:'',did:''}};}
export async function save(data){await chrome.storage.local.set(data);}
export function publicData(data){return{options:data.options,sheet:data.sheet,state:data.state,view:data.view,digestSize:(data.digest??'').length};}
