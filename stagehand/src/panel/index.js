import {exportLog} from '../shared/logExport.js';
const sid=crypto.randomUUID();
const $=id=>document.getElementById(id);
async function send(msg){const result=await chrome.runtime.sendMessage({...msg,sid});if(!result?.ok)throw new Error(result?.error??'Worker unavailable.');return result.data;}
async function act(msg){try{$('error').textContent='';await send(msg);}catch(error){$('error').textContent=error.message;}}
function buttons(container,items,action){const parent=$(container);parent.replaceChildren();for(const item of items){const button=document.createElement('button');button.textContent=item.label??item.id;button.onclick=()=>act(action(item));parent.append(button);if(item.manual_fallback){const p=document.createElement('p');p.className='hint';p.textContent=item.manual_fallback;parent.append(p);}}}
async function render(){
  const data=await send({type:'get'}),{view,sheet,state}=data;
  $('status').textContent=`${view.connected?'● Foundry connected':'○ Foundry disconnected'} · ${view.mic?'● mic':'○ mic'} · ${view.status}`;
  $('heard').textContent=view.heard||'—';$('did').textContent=view.did||'—';
  $('now').textContent=sheet.cues.find(c=>c.id===view.currentCue)?.label??'No cue yet';
  const current=sheet.cues.findIndex(c=>c.id===view.currentCue);buttons('next',sheet.cues.slice(current+1,current+4),c=>({type:'manual',cueId:c.id}));
  buttons('cues',sheet.cues,c=>({type:'manual',cueId:c.id}));buttons('handouts',sheet.handouts??[],c=>({type:'manual',handoutId:c.id}));buttons('rolls',sheet.named_rolls??[],c=>({type:'manual',rollId:c.id}));
  const parent=$('state');if(!parent.contains(document.activeElement)){parent.replaceChildren();for(const [key,value]of Object.entries({...sheet.state,...state})){const label=document.createElement('label');label.textContent=key.replaceAll('_',' ');const input=document.createElement('input');input.type='number';input.value=value;input.onchange=()=>act({type:'set',key,value:Number(input.value)});label.append(input);parent.append(label);}}
  $('lookup').textContent=view.lookup?`${view.lookup.question}\n\n${view.lookup.answer}`:'—';
}
document.querySelectorAll('[data-command]').forEach(button=>button.onclick=()=>act({type:'manual',command:button.dataset.command}));
$('options').onclick=()=>chrome.runtime.openOptionsPage();
$('roll-form').onsubmit=event=>{event.preventDefault();act({type:'manual',text:$('formula').value.startsWith('roll ')?$('formula').value:`roll ${$('formula').value}`});};
$('question-form').onsubmit=event=>{event.preventDefault();act({type:'manual',text:$('question').value});};
function showLog(entries){$('log-entries').textContent=entries.slice(-25).reverse().map(entry=>JSON.stringify(entry)).join('\n');}
$('copy-log').onclick=()=>actLog('copy');
$('download-log').onclick=()=>actLog('download');
async function actLog(action){try{await send({type:'log',ev:`${action}-log`});const entries=await send({type:'getLog'});await exportLog(action,entries);$('error').textContent=action==='copy'?'Log copied.':'Log downloaded.';}catch(error){$('error').textContent=error.message;}}
chrome.storage.onChanged.addListener(changes=>{if(changes.log)showLog(changes.log.newValue??[]);if(['view','sheet','state','options'].some(key=>changes[key]))render().catch(error=>$('error').textContent=error.message);});
render().catch(error=>$('error').textContent=error.message);
send({type:'getLog'}).then(showLog).catch(error=>$('error').textContent=error.message);
