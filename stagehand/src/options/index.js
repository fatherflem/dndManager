const sid=crypto.randomUUID();
const $=id=>document.getElementById(id);
async function send(msg){const r=await chrome.runtime.sendMessage({...msg,sid});if(!r?.ok)throw new Error(r?.error??'Worker unavailable.');if(msg.type==='get'&&(!r.data?.options||!r.data?.view))throw new Error('Stagehand returned no settings. Reload the extension and reopen Options.');return r.data;}
async function task(fn){try{$('message').textContent='';await fn();}catch(error){$('message').textContent=error.message;}}
function voices(){const selected=$('voice').value;$('voice').replaceChildren(new Option('Default',''));for(const v of speechSynthesis.getVoices())$('voice').append(new Option(`${v.name} (${v.lang})`,v.voiceURI));$('voice').value=selected;}
speechSynthesis.onvoiceschanged=voices;voices();
async function sceneErrors(){const data=await send({type:'get'});$('scene-errors').textContent=(data.view.sceneErrors??[]).join('\n');}
chrome.storage.onChanged.addListener(changes=>{if(changes.view)sceneErrors().catch(error=>$('message').textContent=error.message);});sceneErrors().catch(error=>$('message').textContent=error.message);
send({type:'get'}).then(data=>{for(const key of ['model','lang','pttKey','threshold','rate'])$(key).value=data.options[key];$('voice').value=data.options.voice;$('extraOrigins').value=data.options.extraOrigins.join('\n');$('digest-size').textContent=`${data.digestSize} characters`;}).catch(error=>$('message').textContent=error.message);
$('sheet').onchange=()=>task(async()=>{const file=$('sheet').files[0];if(!file)return;await send({type:'sheet',text:await file.text()});$('validation').textContent='Cue sheet valid. Scene names will be checked when the GM tab connects.';});
$('digest').onchange=()=>task(async()=>{const file=$('digest').files[0];if(!file)return;const text=await file.text();await send({type:'digest',text});$('digest-size').textContent=`${text.length} characters`;});
$('settings').onsubmit=event=>{event.preventDefault();task(async()=>{
  const extraOrigins=$('extraOrigins').value.split(/\s+/).filter(Boolean).map(text=>{const u=new URL(text);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('Enter origins only, with no path or credentials.');return u.origin;});
  if(extraOrigins.length){const granted=await chrome.permissions.request({origins:extraOrigins.map(o=>`${o}/*`)});if(!granted)throw new Error('Foundry host permission was not granted.');}
  const options=Object.fromEntries(['model','lang','pttKey','voice'].map(k=>[k,$(k).value]));options.threshold=Number($('threshold').value);options.rate=Number($('rate').value);options.extraOrigins=extraOrigins;
  await send({type:'options',options,apiKey:$('apiKey').value});$('apiKey').value='';$('message').textContent='Settings saved.';
});};
$('test-lookup').onclick=()=>task(async()=>{$('lookup-result').textContent=(await send({type:'testLookup'})).answer;});
$('test-voice').onclick=()=>task(()=>send({type:'testVoice'}));

$('clear-log').onclick=()=>task(async()=>{await send({type:'clearLog'});$('message').textContent='Log cleared.';});
