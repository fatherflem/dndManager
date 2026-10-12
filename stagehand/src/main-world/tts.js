let options={};
export function configureTTS(value){options=value;}
export function speak(text){
  if(!globalThis.speechSynthesis)return;
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.rate=options.rate??1;utterance.lang=options.lang??'en-US';
  const voice=speechSynthesis.getVoices().find(v=>v.voiceURI===options.voice);if(voice)utterance.voice=voice;
  speechSynthesis.speak(utterance);
}
