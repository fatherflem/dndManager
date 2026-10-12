export function matchesKey(event,shortcut){
  const parts=shortcut.split('+'),key=parts.pop();
  return event.key.toLowerCase()===key.toLowerCase()&&event.ctrlKey===parts.includes('Ctrl')&&event.altKey===parts.includes('Alt')&&event.shiftKey===parts.includes('Shift')&&event.metaKey===parts.includes('Meta');
}
export function bindHotkeys(getConfig,callbacks){
  const down=event=>{if(event.repeat||event.isComposing)return;const {options,sheet}=getConfig();if(matchesKey(event,options.pttKey)){event.preventDefault();callbacks.start();return;}if(/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)||event.target?.isContentEditable)return;const cue=sheet.cues?.find(c=>c.hotkey&&matchesKey(event,c.hotkey));if(cue){event.preventDefault();callbacks.cue(cue.id);}};
  const up=event=>{if(event.key.toLowerCase()===getConfig().options.pttKey.split('+').pop().toLowerCase()){event.preventDefault();callbacks.stop();}};
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',callbacks.stop);
  return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',callbacks.stop);};
}
