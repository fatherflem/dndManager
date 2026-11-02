import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize} from '../src/shared/normalize.js';
import {parseDice,substitute,bandFor} from '../src/shared/dice.js';
import {match} from '../src/shared/match.js';
import {routeAlternatives,route} from '../src/shared/grammar.js';
import {parseSheet,validateSheet} from '../src/shared/cuesheet.js';
import {readFileSync} from 'node:fs';
const sheet=parseSheet(readFileSync(new URL('../examples/cuesheet.example.yaml',import.meta.url),'utf8'));
test('normalize spoken dice and number words',()=>{assert.equal(normalize('Roll a D twenty plus five'),'roll 1d20+5');assert.equal(normalize('roll one hundred'),'roll 100');for(const x of ['d twenty','dee twenty','D-20','d 20'])assert.equal(normalize(x),'d20');});
test('parse keep highest and advantage',()=>{assert.equal(parseDice('roll two d six keep highest one'),'2d6kh1');assert.equal(parseDice('roll with advantage'),'2d20kh');assert.equal(parseDice('roll a d twenty disadvantage'),'2d20kl');assert.equal(parseDice('roll two d eight minus one'),'2d8-1');});
test('reject unsafe, malformed and excessive dice expressions',()=>{for(const text of ['roll bananas','roll 0d20','roll 1001d6','roll 2d0','roll 1d20; alert(1)','roll 1d20kh999999'])assert.equal(parseDice(text),null,text);});
test('aliases accept only sufficient similarity',()=>{assert.equal(match('bath house',sheet.cues)?.id,'scene_19_bathhouse');assert.equal(match('hello there',sheet.cues),null);assert.equal(match('bat house',sheet.cues,.95),null);assert.equal(match('bat house',sheet.cues,.82)?.id,'scene_19_bathhouse');});
test('margin rejects ambiguous cues',()=>{assert.equal(match('the abandoned bath house',[{id:'a',voice:['the abandoned bath house']},{id:'b',voice:['the abandoned bath houses']}]),null);});
test('named formulas substitute finite state',()=>{assert.equal(substitute('1d100 + @integrity_lost*@il_multiplier + @war_within*10 + (@castor_turned*10)',{war_within:2,integrity_lost:3,il_multiplier:8,castor_turned:0}),'1d100 + 3*8 + 2*10 + (0*10)');assert.throws(()=>substitute('@missing',{}));assert.equal(bandFor(70,[{max:40,label:'one'},{max:70,label:'two'}]),'two');});
test('validation detects duplicate IDs, unknown actions and alias collisions',()=>{const invalid={version:1,cues:[{id:'a',voice:['hello'],actions:[{type:'unknown'}]},{id:'a',voice:['different'],actions:[{type:'scene'}]},{id:'b',voice:['hello'],actions:[{type:'stop_all'}]}]};const errors=validateSheet(invalid).join(' ');assert.match(errors,/Duplicate/);assert.match(errors,/Unknown action/);assert.match(errors,/Alias collision/);assert.match(errors,/Missing scene name/);});
test('malformed cue sheets are reported',()=>{assert.throws(()=>parseSheet('version: 1\ncues: nope'));assert.equal(validateSheet({version:1,cues:[null]}).length,1);assert.throws(()=>parseSheet('version: 1\ncues: [\n'));});
test('fixed alternatives precede lookup',()=>{assert.equal(routeAlternatives(['what is this','next scene'],sheet).type,'next');assert.equal(routeAlternatives(['what is this','hello there'],sheet).question,'what is this');assert.equal(route('bath house',sheet).cue.id,'scene_19_bathhouse');});
test('state updates use aliases',()=>{assert.deepEqual(route('set war within two',sheet),{type:'set',key:'war_within',value:2});assert.equal(route('set unknown two',sheet),null);});
test('all fixed grammar verbs are routed',()=>{for(const [text,type]of [['panic','panic'],['repeat','repeat'],['silence','stop_all'],['hide handout','hide_handout'],['previous scene','previous'],['show harding','handout'],['music bathhouse','cue'],['roll junk','invalid_roll']])assert.equal(route(text,sheet)?.type,type,text);});

const cue=(id,voice,actions=[{type:'macro',name:id}])=>({id,voice,actions});
test('documented bare names route every cue and handout with one margin check',()=>{
  const s={cues:[cue('scream',['scream']),cue('matron',['matron'],[{type:'oneshot',src:'x'}])],handouts:[{id:'portrait',voice:['portrait'],src:'x'}]};
  assert.equal(route('scream',s).cue.id,'scream');assert.equal(route('matron',s).cue.id,'matron');assert.equal(route('portrait',s).handout.id,'portrait');
  s.handouts.push({id:'other',voice:['scream'],src:'y'});assert.equal(route('scream',s),null);
});
test('music prefix accepts music actions and validation requires music/macro names',()=>{
  const s={version:1,cues:[cue('track',['track'],[{type:'music',name:'Track'}])]};
  assert.equal(route('music track',s).cue.id,'track');assert.deepEqual(validateSheet(s),[]);
  for(const type of ['music','macro'])assert.match(validateSheet({version:1,cues:[cue('bad',['bad'],[{type}])]}).join(),new RegExp(`Missing ${type} name: bad`));
});
test('initiative parses both word orders, optional for, negative values and spoken numbers',()=>{
  for(const text of ['initiative bard seventeen','initiative for bard 17','bard initiative 17'])assert.deepEqual(route(text,{cues:[]}),{type:'initiative',who:'bard',value:17});
  assert.deepEqual(route('initiative for the Fighter minus two',{cues:[]}),{type:'initiative',who:'the fighter',value:-2});
  assert.deepEqual(route('fighter initiative minus two',{cues:[]}),{type:'initiative',who:'fighter',value:-2});
  assert.equal(normalize('bard 17'),'bard 17');assert.equal(route('initiative bard banana',{cues:[]}),null);
});
test('all leading command phrases retry only after the raw phrase misses',()=>{
  const s={cues:[cue('crater',['the crater'])]};
  for(const prefix of ['open','go to','switch to','cut to','show','bring up','pull up'])assert.equal(route(`${prefix} the crater`,s).cue.id,'crater',prefix);
  const raw={cues:[cue('show',['show timer']),cue('timer',['timer'])]};
  assert.equal(route('show timer',raw).cue.id,'show');
});
test('fallback preserves raw and stripped ambiguity safeguards',()=>{
  const same=[cue('a',['the crater']),cue('b',['the crater'])];
  assert.equal(route('open the crater',{cues:same}),null);
  assert.equal(route('open something else',{cues:same}),null);
  assert.equal(route('show timer',{cues:[cue('a',['show timer']),cue('b',['show timer']),cue('c',['timer'])]}),null);
  assert.equal(route('open the crater',{cues:[cue('c',['the crater'])]},1).cue.id,'c');
});
const patternSheet={version:1,cues:[{id:'timer_set',label:'Set the timer',pattern:'^(?:set )?timer (?<minutes>\\d+)(?: minutes?)?$',actions:[{type:'macro',name:'Timer Set'}]}]};
test('optional patterns accept both timer phrases without requiring voice aliases',()=>{
  assert.deepEqual(validateSheet(patternSheet),[]);
  for(const text of ['timer 5 minutes','set timer five minutes'])assert.deepEqual(route(text,patternSheet).scope,{minutes:5});
  assert.equal(route('bath house',sheet).cue.id,'scene_19_bathhouse');
});
test('number words zero through sixty normalize before pattern matching',()=>{
  const small='zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
  const tens=['','','twenty','thirty','forty','fifty','sixty'];
  for(let n=0;n<=60;n++){
    const words=n<20?small[n]:tens[Math.floor(n/10)]+(n%10?' '+small[n%10]:'');
    assert.equal(normalize(words),String(n));assert.deepEqual(route(`timer ${words} minutes`,patternSheet).scope,{minutes:n});
  }
});
test('pattern captures convert digits only and retain other strings',()=>{
  const s={cues:[{...patternSheet.cues[0],pattern:'^timer (?<minutes>\\d+) (?<target>[a-z]+)(?: (?<optional>later))?$'}]};
  assert.deepEqual(route('timer 05 bard',s).scope,{minutes:5,target:'bard'});
  const signed={cues:[{...patternSheet.cues[0],pattern:'^timer(?<amount>-\\d+)$'}]};
  assert.deepEqual(route('timer -5',signed).scope,{amount:'-5'});
});
test('initiative precedes patterns and patterns precede bare-name matching',()=>{
  const s={cues:[{...patternSheet.cues[0],pattern:'.*'},cue('bare',['timer 5 minutes'])]};
  assert.equal(route('initiative bard 17',s).type,'initiative');assert.equal(route('timer 5 minutes',s).cue.id,'timer_set');
});
test('invalid and non-string regex errors identify their cue at load time',()=>{
  for(const pattern of ['[',42])assert.match(validateSheet({version:1,cues:[{...patternSheet.cues[0],pattern}]}).join(),/Invalid pattern for cue timer_set/);
  assert.throws(()=>parseSheet('version: 1\ncues:\n  - id: broken_timer\n    pattern: "["\n    actions: [{type: macro, name: Timer}]'),/Invalid pattern for cue broken_timer/);
});
