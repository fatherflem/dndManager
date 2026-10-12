const small = Object.fromEntries('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ').map((x,i)=>[x,i]));
const tens = {twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
export function normalize(text) {
  let words=String(text).toLowerCase().replace(/d[-\s]+(?=\d)/g,'d').replace(/[^a-z0-9@+\-\s]/g,' ').trim().split(/\s+/);
  const out=[];
  for(let i=0;i<words.length;i++) {
    if(words[i] in small || words[i] in tens) {
      let n=0;
      while(i<words.length) {
        const w=words[i];
        if(w in small)n+=small[w]; else if(w in tens)n+=tens[w]; else if(w==='hundred')n*=100; else break;
        i++;
      }
      i--;out.push(String(n));
    } else out.push(words[i]);
  }
  return out.join(' ').replace(/\b(?:d|dee)\s*(\d+)\b/g,'d$1').replace(/\ba\s+(d\d+)/g,'1$1').replace(/\b(\d+)\s+(d\d+)/g,'$1$2').replace(/\bplus\b/g,'+').replace(/\bminus\b/g,'-').replace(/\s*([+\-])\s*/g,'$1').replace(/\s+/g,' ').trim();
}
