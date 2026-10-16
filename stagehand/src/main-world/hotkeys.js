export function matchesKey(event,shortcut){
  const parts=shortcut.split('+'),key=parts.pop();
  return event.key.toLowerCase()===key.toLowerCase()&&event.ctrlKey===parts.includes('Ctrl')&&event.altKey===parts.includes('Alt')&&event.shiftKey===parts.includes('Shift')&&event.metaKey===parts.includes('Meta');
}
export function bindHotkeys(getConfig,callbacks,target=window){
  const down=event=>{if(event.repeat||event.isComposing)return;const {options,sheet}=getConfig();if(matchesKey(event,options.pttKey)){event.preventDefault();callbacks.log?.('ptt-down',{key:options.pttKey});callbacks.start();return;}if(/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)||event.target?.isContentEditable)return;const cue=sheet.cues?.find(c=>c.hotkey&&matchesKey(event,c.hotkey));if(cue){event.preventDefault();callbacks.log?.('hotkey',{cueId:cue.id});callbacks.cue(cue.id);}};
  const up=event=>{if(event.key.toLowerCase()===getConfig().options.pttKey.split('+').pop().toLowerCase()){event.preventDefault();callbacks.log?.('ptt-up',{key:getConfig().options.pttKey});callbacks.stop();}};
  target.addEventListener('keydown',down);target.addEventListener('keyup',up);target.addEventListener('blur',callbacks.stop);
  return()=>{target.removeEventListener('keydown',down);target.removeEventListener('keyup',up);target.removeEventListener('blur',callbacks.stop);};
}
