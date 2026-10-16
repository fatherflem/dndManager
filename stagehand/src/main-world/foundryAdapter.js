// Verified against the official Foundry 14.368 documentation; see API_VERIFICATION.md.
export const TARGET_VERSION=14;
export const adapterStatus='Foundry v14 adapter; remote non-playlist stop is unsupported';
export function createAdapter({getGame=()=>globalThis.game,getFoundry=()=>globalThis.foundry,getConfig=()=>globalThis.CONFIG,getStorage=()=>globalThis.localStorage}={}) {
  let originalVolume,enabled=false;const volumeOwner=crypto.randomUUID();
  const volumeKey=()=>`stagehand:playlist-volume:${getGame()?.world?.id??'world'}:${getGame()?.user?.id??'user'}`;
  function baseline(){try{const value=JSON.parse(getStorage()?.getItem(volumeKey())??'null');return Number.isFinite(value?.volume)&&value.volume>0?value:undefined;}catch{return undefined;}}
  function retain(volume){try{getStorage()?.setItem(volumeKey(),JSON.stringify({volume,owner:volumeOwner}));}catch{/* In-memory restoration still works if local storage is unavailable. */}}const images=new Set();
  const isGM=()=>getGame()?.user?.isGM===true;
  function assertGM(){if(!isGM())throw new Error('Stagehand requires a GM.');}
  function assertVersion(){if(Number(String(getGame()?.version).split('.')[0])!==TARGET_VERSION)throw new Error('Stagehand requires Foundry v14.');}
  function requireEnabled(){assertGM();assertVersion();if(!enabled)throw new Error('Stagehand is disabled.');}
  function find(collection,action,kind){const document=action.id?collection?.get(action.id):collection?.getName(action.name);if(!document)throw new Error(`${kind} not found: ${action.id??action.name}`);return document;}
  async function enable(){
    assertGM();assertVersion();if(enabled)return;
    const settings=getGame().settings,config=settings?.settings?.get('core.globalPlaylistVolume');
    if(config?.scope!=='client')throw new Error('Cannot verify a client-local core.globalPlaylistVolume setting.');
    const volume=settings.get('core','globalPlaylistVolume');if(!Number.isFinite(volume))throw new Error('Invalid Foundry playlist volume.');
    // Reconnects and a second Forge tab must not replace the original with 0.
    originalVolume=volume>0?volume:baseline()?.volume;if(originalVolume!==undefined)retain(originalVolume);
    await settings.set('core','globalPlaylistVolume',0);enabled=true;
  }
  async function disable(){if(!enabled)return;if(originalVolume!==undefined&&(!baseline()||baseline().owner===volumeOwner)){await getGame().settings.set('core','globalPlaylistVolume',originalVolume);try{getStorage()?.removeItem(volumeKey());}catch{}}enabled=false;originalVolume=undefined;}
  // Another Forge tab owns the shared client volume now; leave it muted.
  function relinquish(){enabled=false;originalVolume=undefined;}
  async function stopAll(){
    const game=getGame();
    const results=await Promise.allSettled([...game.playlists.playing].map(playlist=>playlist.stopAll()));
    const local=await Promise.allSettled([...game.audio.playing.values()].map(sound=>sound.stop()));
    const error=[...results,...local].find(result=>result.status==='rejected');if(error)throw error.reason;
    return{warning:'Playlist audio stopped for everyone. Remote non-playlist sounds cannot be stopped through the documented public API.'};
  }
  async function runAction(action,{signal}={}){
    requireEnabled();signal?.throwIfAborted();const game=getGame(),foundry=getFoundry();
    switch(action.type){
      case 'scene':{const scene=find(game.scenes,action,'Scene');if(scene.active)return{already:true};await scene.activate();return{};}
      case 'playlist':await find(game.playlists,action,'Playlist').playAll();return{};
      case 'sound':{const playlist=find(game.playlists,{name:action.playlist,id:action.playlistId},'Playlist');await playlist.playSound(find(playlist.sounds,action,'Track'));return{};}
      case 'stop_all':return stopAll();
      case 'oneshot':{
        if(!action.src)throw new Error('Missing one-shot source.');
        const volume=action.volume??1;if(!Number.isFinite(volume)||volume<0||volume>1)throw new Error('Invalid one-shot volume.');
        foundry.audio.AudioHelper.play({src:action.src,volume,loop:false,autoplay:true,channel:'music'},true);return{};
      }
      case 'handout':{
        if(!action.src)throw new Error('Missing handout source.');
        const title=action.title??action.label??action.id??'Handout';
        const image=new foundry.applications.apps.ImagePopout({src:action.src,window:{title}});
        images.add(image);image.shareImage({image:action.src,title,showTitle:true});return{};
      }
      case 'hide_handout':{
        await Promise.all([...images].map(image=>image.close()));images.clear();
        return{warning:'Closed Stagehand image windows on this client. The public API does not expose remote image closing.'};
      }
      case 'wait':{
        if(!Number.isFinite(action.ms)||action.ms<0||action.ms>60000)throw new Error('Invalid wait duration.');
        await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},action.ms);signal?.addEventListener('abort',abort,{once:true});});return{};
      }
      default:throw new Error(`Unsupported Foundry action: ${action.type}`);
    }
  }
  async function roll(formula){
    requireEnabled();const Roll=getFoundry().dice.Roll;
    if(!Roll.validate(formula))throw new Error('Not a roll.');
    if(!getConfig()?.ChatMessage?.modes?.selfroll)throw new Error('Foundry selfroll message mode is unavailable.');
    const result=await new Roll(formula).evaluate({allowInteractive:false});
    await result.toMessage({flavor:'Stagehand',whisper:[getGame().user.id],blind:false},{messageMode:'selfroll'});
    return{total:result.total,result:result.result};
  }
  async function validateScenes(sheet){
    if(!isGM())return[];const errors=[];
    for(const cue of sheet.cues??[])for(const action of cue.actions??[])if(action.type==='scene'){try{find(getGame().scenes,action,'Scene');}catch(error){errors.push(error.message);}}
    if(sheet.black_scene){try{find(getGame().scenes,{name:sheet.black_scene},'Black scene');}catch(error){errors.push(error.message);}}
    return[...new Set(errors)];
  }
  return{isGM,assertGM,enable,disable,relinquish,runAction,roll,validateScenes};
}
const adapter=createAdapter();
export const {isGM,assertGM,enable,disable,relinquish,runAction,roll,validateScenes}=adapter;
