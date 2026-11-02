import {normalize} from './normalize.js';
import {parseDice} from './dice.js';
import {matchWithScore} from './match.js';
const leadingCommand=/^(?:open|go to|switch to|cut to|show|bring up|pull up) /;
const fillers=new Set(['the','a','an','uh','um','er','hmm','and','so']);
export function dropReason(text){const s=normalize(text);return !s?'empty-transcript':s.length===1?'single-character':fillers.has(s)?'filler-word':null;}
export function route(text,sheet,threshold=.82,onMatch=()=>{}) {
  const match=(...args)=>{const result=matchWithScore(...args);onMatch(result);return result.item;};
  const s=normalize(text),cues=sheet.cues??[];
  const simple={'next scene':'next','previous scene':'previous','kill audio':'stop_all','stop music':'stop_all',silence:'stop_all',panic:'panic',repeat:'repeat','hide handout':'hide_handout'};
  if(simple[s])return {type:simple[s]};
  // Normalization joins a minus sign to the preceding word.
  const init=s.match(/^initiative (?:for )?(.+?)(?: |(?=-))(-?\d+)$/)||s.match(/^(.+?) initiative(?: |(?=-))(-?\d+)$/);
  if(init)return{type:'initiative',who:init[1],value:Number(init[2])};
  for(const cue of cues){
    if(cue.pattern===undefined)continue;
    const result=new RegExp(cue.pattern).exec(s);
    if(result){
      const groups=result.groups;
      const scope=Object.fromEntries(Object.entries(groups??{}).filter(([,value])=>value!==undefined).map(([key,value])=>[key,/^\d+$/.test(value)?Number(value):value]));
      return{type:'cue',cue,scope};
    }
  }
  if(s.startsWith('roll ')){const formula=parseDice(s);if(formula)return{type:'roll',formula};const roll=match(s.slice(5),sheet.named_rolls??[],threshold);return roll?{type:'named_roll',roll}:{type:'invalid_roll'};}
  if(s.startsWith('set ')){const m=s.match(/^set (.+?) (-?\d+)$/);if(m){const keys=Object.keys(sheet.state??{}).map(id=>({id,voice:[id.replaceAll('_',' ')]}));const item=match(m[1],keys,threshold);if(item)return{type:'set',key:item.id,value:Number(m[2])};}}
  const sceneCues=cues.filter(c=>c.actions.some(a=>a.type==='scene'));
  if(s.startsWith('scene ')){const cue=match(s.slice(6),sceneCues,threshold);if(cue)return{type:'cue',cue};}
  else if(s.startsWith('music ')){const cue=match(s.slice(6),cues.filter(c=>c.actions.some(a=>['playlist','music','sound'].includes(a.type))),threshold);if(cue)return{type:'cue',cue};}
  else {
    const pool=[...cues,...(sheet.handouts??[])];
    const command=item=>item.actions?{type:'cue',cue:item}:{type:'handout',handout:item};
    const raw=matchWithScore(s,pool,threshold);onMatch(raw);
    if(raw.item)return command(raw.item);
    // A high-scoring but ambiguous raw phrase must never be rescued by stripping.
    if(raw.score<threshold&&leadingCommand.test(s)){
      const item=match(s.replace(leadingCommand,''),pool,threshold);
      if(item)return command(item);
    }
  }
  return null;
}
export function routeAlternatives(alternatives,sheet,threshold,report=()=>{}){
  let best=0,secondScore=0;
  for(const [alternative,text]of alternatives.entries()){
    if(dropReason(text))continue;
    let matched;
    const command=route(text,sheet,threshold,result=>{if(result.score>best){best=result.score;secondScore=result.secondScore;}if(result.item)matched=result;});
    if(command){report({type:command.type,score:matched?.score??1,secondScore:matched?.secondScore??0,cueId:command.cue?.id,alternative,transcript:text});return command;}
  }
  const question=alternatives.find(text=>!dropReason(text));
  if(question===undefined){const reason=dropReason(alternatives[0]??'');report({type:'dropped',dropped:true,reason,transcript:alternatives[0]??''});return{type:'dropped',reason};}
  report({type:'lookup',score:best,secondScore,transcript:question});
  return{type:'lookup',question};
}
