import {normalize} from './normalize.js';
import {parseDice} from './dice.js';
import {matchWithScore} from './match.js';
export function route(text,sheet,threshold=.82,onMatch=()=>{}) {
  const match=(...args)=>{const result=matchWithScore(...args);onMatch(result);return result.item;};
  const s=normalize(text),cues=sheet.cues??[];
  const simple={'next scene':'next','previous scene':'previous','kill audio':'stop_all','stop music':'stop_all',silence:'stop_all',panic:'panic',repeat:'repeat','hide handout':'hide_handout'};
  if(simple[s])return {type:simple[s]};
  if(s.startsWith('roll ')){const formula=parseDice(s);if(formula)return{type:'roll',formula};const roll=match(s.slice(5),sheet.named_rolls??[],threshold);return roll?{type:'named_roll',roll}:{type:'invalid_roll'};}
  if(s.startsWith('set ')){const m=s.match(/^set (.+?) (-?\d+)$/);if(m){const keys=Object.keys(sheet.state??{}).map(id=>({id,voice:[id.replaceAll('_',' ')]}));const item=match(m[1],keys,threshold);if(item)return{type:'set',key:item.id,value:Number(m[2])};}}
  const sceneCues=cues.filter(c=>c.actions.some(a=>a.type==='scene'));
  if(s.startsWith('scene ')){const cue=match(s.slice(6),sceneCues,threshold);if(cue)return{type:'cue',cue};}
  else if(s.startsWith('music ')){const cue=match(s.slice(6),cues.filter(c=>c.actions.some(a=>['playlist','sound'].includes(a.type))),threshold);if(cue)return{type:'cue',cue};}
  else if(s.startsWith('show ')){const handout=match(s.slice(5),sheet.handouts??[],threshold);if(handout)return{type:'handout',handout};}
  else {const cue=match(s,sceneCues,threshold);if(cue)return{type:'cue',cue};}
  return null;
}
export function routeAlternatives(alternatives,sheet,threshold,report=()=>{}){
  let best=0,secondScore=0;
  for(const [alternative,text]of alternatives.entries()){
    let matched;
    const command=route(text,sheet,threshold,result=>{if(result.score>best){best=result.score;secondScore=result.secondScore;}if(result.item)matched=result;});
    if(command){report({type:command.type,score:matched?.score??1,secondScore:matched?.secondScore??0,cueId:command.cue?.id,alternative,transcript:text});return command;}
  }
  report({type:'lookup',score:best,secondScore,transcript:alternatives[0]??''});
  return{type:'lookup',question:alternatives[0]??''};
}
