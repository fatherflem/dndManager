export async function exportLog(action,entries){
  if(action==='copy'){await navigator.clipboard.writeText(JSON.stringify(entries.slice(-300),null,2));return;}
  const url=URL.createObjectURL(new Blob([JSON.stringify(entries,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`stagehand-log-${new Date().toISOString().slice(0,10)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
