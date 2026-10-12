import {normalize} from './normalize.js';
function similarity(a,b) {
  if(a===b)return 1;
  const x=[...new Set(a.split(' '))].sort().join(' '),y=[...new Set(b.split(' '))].sort().join(' ');
  let row=Array.from({length:y.length+1},(_,i)=>i);
  for(let i=1;i<=x.length;i++){const next=[i];for(let j=1;j<=y.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(x[i-1]===y[j-1]?0:1));row=next;}
  return 1-row[y.length]/Math.max(x.length,y.length,1);
}
export function match(text,items,threshold=.82) {
  const ranked=items.map(item=>({item,score:Math.max(0,...(item.voice??[]).map(a=>similarity(normalize(text),normalize(a))))})).sort((a,b)=>b.score-a.score);
  const first=ranked[0];return first&&first.score>=threshold&&first.score-(ranked[1]?.score??0)>=.08?first.item:null;
}
