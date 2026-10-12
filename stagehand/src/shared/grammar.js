import {normalize} from './normalize.js';
import {parseDice} from './dice.js';
import {match} from './match.js';
export function route(text,sheet,threshold=.82) {
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
export function routeAlternatives(alternatives,sheet,threshold){for(const text of alternatives){const command=route(text,sheet,threshold);if(command)return command;}return{type:'lookup',question:alternatives[0]??''};}
