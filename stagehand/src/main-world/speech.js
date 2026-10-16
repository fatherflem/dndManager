export function createSpeech({getOptions,emit,speak,allowed,log=()=>{}}){
  let recognition,active=false,timer,alternatives=[],aborted=false,toggleMode=false,emitted=false;
  const finalize=()=>{if(!aborted&&!emitted&&alternatives.length){emitted=true;emit({type:'transcript',alternatives});}};
  const stop=()=>{active=false;clearTimeout(timer);if(recognition)recognition.stop();else finalize();};
  const abort=()=>{aborted=true;active=false;clearTimeout(timer);recognition?.abort();};
  const resetTimer=()=>{clearTimeout(timer);timer=setTimeout(stop,6000);};
  function start(toggle=false){
    if(active||!allowed())return;
    const Recognition=globalThis.webkitSpeechRecognition;if(!Recognition){emit({type:'status',status:'error',mic:false,error:'Chrome speech recognition is unavailable.'});speak('Mic unavailable.');return;}
    recognition=new Recognition();recognition.lang=getOptions().lang??'en-US';recognition.interimResults=true;recognition.maxAlternatives=5;recognition.continuous=true;
    alternatives=[];aborted=false;active=true;toggleMode=toggle;emitted=false;
    recognition.onresult=event=>{
      const results=Array.from(event.results);log('speech-result',{transcript:results.map(r=>r[0].transcript).join(' ')});emit({type:'live',text:results.map(r=>r[0].transcript).join(' ')});
      const finals=results.filter(r=>r.isFinal);if(finals.length)alternatives=Array.from({length:Math.min(5,Math.max(...finals.map(r=>r.length)))},(_,i)=>finals.map(r=>(r[i]??r[0]).transcript).join(' '));
      if(toggle)resetTimer();
    };
    recognition.onerror=event=>{log('speech-error',{error:event.error});aborted=true;const text={'no-speech':"Didn't catch that.",network:'Speech network error.','not-allowed':'Mic blocked.'}[event.error]??'Mic error.';emit({type:'status',status:'error',mic:false,error:text});speak(text);};
    recognition.onend=()=>{log('speech-end');recognition=null;clearTimeout(timer);emit({type:'status',status:aborted?'error':'idle',mic:false});if(toggleMode||!active||aborted){active=false;finalize();}};
    recognition.onstart=()=>{log('speech-start');emit({type:'status',status:'listening',mic:true});try{const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=.025;osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.045);osc.onended=()=>ctx.close();}catch{}};
    try{recognition.start();if(toggle)resetTimer();}catch(error){log('speech-error',{error:error.message});active=false;emit({type:'status',status:'error',mic:false,error:error.message});}
  }
  return{start,stop,abort,toggle:()=>active?stop():start(true)};
}
