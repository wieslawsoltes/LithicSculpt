import {readFile,writeFile,mkdir} from 'node:fs/promises';
const files=['math','mesh','sculpt','topology','model','render','io','app'];
async function source(name){return (await readFile(`src/${name}.js`,'utf8')).replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'');}
const worker=(await Promise.all(['math','mesh','topology','worker'].map(source))).join('\n');
const bundle='globalThis.__LITHIC_WORKER_SOURCE__='+JSON.stringify(worker)+';\n'+(await Promise.all(files.map(source))).join('\n');
let html=await readFile('index.html','utf8');const css=await readFile('style.css','utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${css}</style>`).replace('<script type="module" src="src/app.js"></script>',()=>`<script type="module">${bundle.replace(/<\/script/gi,'<\\/script')}</script>`);
await mkdir('dist',{recursive:true});await writeFile('dist/lithic-sculpt.html',html);console.log(`Built standalone HTML (${(Buffer.byteLength(html)/1024).toFixed(1)} KB).`);
