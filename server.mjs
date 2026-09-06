import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url)),port=Number(process.env.PORT||8080),host=process.env.HOST||'127.0.0.1';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root.endsWith(sep)?root:root+sep))throw Error('Invalid path');const info=await stat(file);if(!info.isFile())throw Error('Not a file');res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(await readFile(file));}catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}}).listen(port,host,()=>console.log(`Lithic Sculpt → http://${host}:${port}`));
