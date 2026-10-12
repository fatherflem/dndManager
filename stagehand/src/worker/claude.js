const instruction='You are a stagehand whispering to a game master mid-session. Answer in one or two short spoken sentences. Use only the rules digest. End with the section name in brackets. If the digest doesn\'t answer it, say "Not in the digest."';
export async function lookup(question,data,fetcher=fetch,{signal}={}){
  if(!data.apiKey)throw new Error('Add a Claude API key in options.');
  if(!data.digest)throw new Error('Upload a rules digest in options.');
  const response=await fetcher('https://api.anthropic.com/v1/messages',{method:'POST',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000),headers:{'x-api-key':data.apiKey,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:data.options.model,max_tokens:200,system:[{type:'text',text:instruction},{type:'text',text:data.digest,cache_control:{type:'ephemeral'}}],messages:[...(data.history??[]).slice(-6),{role:'user',content:question}]})});
  if(!response.ok)throw new Error(`Claude lookup failed (${response.status}).`);
  const body=await response.json(),answer=(body.content??[]).filter(x=>x.type==='text').map(x=>x.text).join(' ');
  if(!answer)throw new Error('Claude returned no answer.');
  return{answer,spoken:answer.replace(/\s*\[[^\]]*\]\s*$/,'').trim(),history:[...(data.history??[]),{role:'user',content:question},{role:'assistant',content:answer}].slice(-6)};
}
