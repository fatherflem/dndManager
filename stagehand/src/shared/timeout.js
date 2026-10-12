export async function withTimeout(operation,ms=8000){
  let timer;
  try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Foundry action timed out. Check the connection.')),ms);})]);}
  finally{clearTimeout(timer);}
}
