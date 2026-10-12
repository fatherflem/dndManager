import {normalize} from './normalize.js';
export function parseDice(text) {
  let s=normalize(text).replace(/^roll\s+/,'').replace(/^with /,'');
  if(s==='advantage')s='2d20kh'; else if(s==='disadvantage')s='2d20kl';
  s=s.replace(/keep highest\s*(\d+)/g,'kh$1').replace(/keep lowest\s*(\d+)/g,'kl$1').replace(/(?:1?d20)\s+(disadvantage|advantage)/g,(_,x)=>x==='advantage'?'2d20kh':'2d20kl').replace(/\s+/g,'').replace(/^d/,'1d');
  const parts=s.match(/^(\d+)d(\d+)(?:k[hl](\d*))?(?:[+\-]\d+)*$/);
  return parts && +parts[1]>0 && +parts[1]<=1000 && +parts[2]>0 && +parts[2]<=1000000 && (parts[3]===undefined||parts[3]===''||(+parts[3]>0&&+parts[3]<=+parts[1])) ? s : null;
}
export function substitute(formula,state) {
  return formula.replace(/@([a-z_][a-z0-9_]*)/gi,(_,key)=>{
    if(!Number.isFinite(state[key]))throw new Error(`Missing state: ${key}`);
    return String(state[key]);
  });
}
export function bandFor(total,bands=[]) {return bands.find(b=>total<=b.max)?.label??'';}
