const TAG='stagehand-v1';
window.addEventListener('message',async event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.tag!==TAG||event.data.direction!=='to-extension')return;
  const msg=event.data.payload;
  if(!msg||!['log','ready','ping','transcript','live','status','result'].includes(msg.type))return;
  try {const response=await chrome.runtime.sendMessage({...msg,source:'bridge'});if(response?.ok&&response.data)window.postMessage({tag:TAG,direction:'to-page',payload:response.data},location.origin);}catch(error){if(!chrome.runtime?.id||/Extension context invalidated|extension has been unloaded/i.test(error.message))window.postMessage({tag:TAG,direction:'to-page',payload:{type:'shutdown',reason:'extension-off'}},location.origin);}
});
chrome.runtime.onMessage.addListener((msg,_sender,respond)=>{if(msg.target==='page'){window.postMessage({tag:TAG,direction:'to-page',payload:msg},location.origin);respond({delivered:true});}});
