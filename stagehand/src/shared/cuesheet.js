import {parse} from 'yaml';
import {normalize} from './normalize.js';
export function parseSheet(text){const sheet=parse(text);const errors=validateSheet(sheet);if(errors.length)throw new Error(errors.join('\n'));return sheet;}
export function validateSheet(s){
  const errors=[];if(!s||s.version!==1||!Array.isArray(s.cues))return['Expected version: 1 and a cues array.'];
  const ids=new Set(),aliases=new Map(),types=new Set(['scene','playlist','sound','stop_all','oneshot','handout','wait']);
  for(const category of ['cues','handouts','named_rolls']) {
    if(s[category]!==undefined&&!Array.isArray(s[category])){errors.push(`${category} must be an array`);continue;}
    for(const item of s[category]??[]) {
      if(!item||typeof item!=='object'){errors.push(`Invalid ${category} entry`);continue;}
      if(!item.id||ids.has(item.id))errors.push(`Duplicate or missing id: ${item.id}`);ids.add(item.id);
      if(!Array.isArray(item.voice)||item.voice.some(a=>typeof a!=='string'||!a.trim()))errors.push(`Invalid aliases: ${item.id}`);
      for(const alias of Array.isArray(item.voice)?item.voice:[]){const key=normalize(alias);if(aliases.has(key)&&aliases.get(key)!==item.id)errors.push(`Alias collision: ${alias}`);aliases.set(key,item.id);}
      if(category==='cues'){
        if(!Array.isArray(item.actions)||!item.actions.length){errors.push(`Missing actions: ${item.id}`);continue;}
        for(const a of item.actions){if(!a||!types.has(a.type)){errors.push(`Unknown action type: ${a?.type}`);continue;}if(['scene','playlist','sound'].includes(a.type)&&!a.name)errors.push(`Missing ${a.type} name: ${item.id}`);if(['oneshot','handout'].includes(a.type)&&!a.src)errors.push(`Missing source: ${item.id}`);if(a.type==='sound'&&!a.playlist)errors.push(`Missing playlist: ${item.id}`);if(a.type==='wait'&&(!Number.isFinite(a.ms)||a.ms<0||a.ms>60000))errors.push(`Invalid wait: ${item.id}`);}
      }
      if(category==='handouts'&&!item.src)errors.push(`Missing handout source: ${item.id}`);
      if(category==='named_rolls'&&(typeof item.formula!=='string'||!item.formula.trim()))errors.push(`Missing roll formula: ${item.id}`);
    }
  }
  if(s.state&&Object.values(s.state).some(v=>!Number.isFinite(v)))errors.push('State defaults must be numeric');
  return errors;
}
