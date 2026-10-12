import {build} from 'esbuild';
import {mkdir,copyFile,cp} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/worker/index.js','src/main-world/index.js','src/content/bridge.js','src/panel/index.js','src/options/index.js'],outbase:'src',outdir:'dist',bundle:true,format:'iife',target:'chrome120'});
await copyFile('manifest.json','dist/manifest.json');
for (const name of ['panel','options']) await cp(`src/${name}/index.html`,`dist/${name}/index.html`);
await copyFile('src/panel/style.css','dist/panel/style.css');
await copyFile('src/panel/style.css','dist/options/style.css');
