import http from 'node:http';
import {readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStore} from './store.js';
import {authorized,parseAllowed,normalizeUrl} from './security.js';
import {auditPage} from './audit.js';
import {createDemo} from './demo.js';
import {compareReports,makeCsv} from './report.js';

const root=resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const dataDir=resolve(process.env.DATA_DIR||new URL('../data/',import.meta.url).pathname);
const shotDir=join(dataDir,'screenshots');mkdirSync(shotDir,{recursive:true,mode:0o700});
const store=createStore(dataDir);
const base=(process.env.BASE_PATH||'/accessbloom').replace(/\/$/,'');
const secret=process.env.SCAN_ACCESS_TOKEN||'';
const allowed=parseAllowed(process.env.SCAN_ALLOWED_HOSTS||'');
const maxPerHour=Number(process.env.MAX_SCAN_PER_HOUR||20);
const rate=new Map(); let inFlight=false;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.json':'application/json; charset=utf-8'};
function send(res,status,data,type='application/json; charset=utf-8'){
  const body=Buffer.isBuffer(data)?data:typeof data==='string'?data:JSON.stringify(data);
  res.writeHead(status,{'Content-Type':type,'Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(body);
}
function failure(res,status,message){send(res,status,{error:message});}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000) throw new Error('Request too large.');}try{return JSON.parse(raw||'{}');}catch{throw new Error('Invalid JSON.');}}
function limit(ip){const now=Date.now();const items=(rate.get(ip)||[]).filter(t=>now-t<3600_000);if(items.length>=maxPerHour)return false;items.push(now);rate.set(ip,items);if(rate.size>500)for(const [k,v] of rate)if(!v.some(t=>now-t<3600_000))rate.delete(k);return true;}
const app=http.createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://localhost').pathname;
    const rel=path.startsWith(base+'/')?path.slice(base.length):path===base?'/':null;
    if(rel===null) return failure(res,404,'Not found.');
    if(req.method==='GET'&&rel==='/api/health')return send(res,200,{status:'ok',version:'1.0.0'});
    if(req.method==='GET'&&rel==='/api/config')return send(res,200,{base,aiConfigured:!!process.env.OPENAI_API_KEY&&process.env.AI_ENABLED!=='false',ownerAuthConfigured:secret.length>=24,realScanAvailable:!!allowed.length,demoAvailable:true});
    if(req.method==='GET'&&rel==='/api/demo')return send(res,200,createDemo());
    if(rel.startsWith('/api/')){
      if(!authorized(req,secret))return failure(res,401,'Owner access token is required for live scans and saved results.');
      if(req.method==='GET'&&rel==='/api/reports')return send(res,200,store.list());
      if(req.method==='POST'&&rel==='/api/scans'){
        if(inFlight)return failure(res,429,'A scan is already running.');
        if(!limit(req.socket.remoteAddress))return failure(res,429,'Hourly scanning limit reached.');
        const input=await body(req); normalizeUrl(input.url);inFlight=true;
        try {
          const {report,screenshotBuffer}=await auditPage(input.url,{allowedHosts:allowed});
          if(screenshotBuffer){writeFileSync(join(shotDir,report.id+'.jpg'),screenshotBuffer,{mode:0o600});report.screenshot=`${base}/api/reports/${report.id}/screenshot`;}
          store.put(report);return send(res,201,{...report,reviews:{}});
        }finally {inFlight=false;}
      }
      const shot=rel.match(/^\/api\/reports\/([a-f0-9-]{36})\/screenshot$/);
      if(req.method==='GET'&&shot){const f=join(shotDir,shot[1]+'.jpg');return existsSync(f)?send(res,200,readFileSync(f),'image/jpeg'):failure(res,404,'Screenshot not found.');}
      const file=rel.match(/^\/api\/reports\/([a-f0-9-]{36})\/export\/(json|csv)$/);
      if(req.method==='GET'&&file){const r=store.get(file[1]);if(!r)return failure(res,404,'Report not found.');return file[2]==='csv'?send(res,200,makeCsv(r),'text/csv; charset=utf-8'):send(res,200,r);}
      const review=rel.match(/^\/api\/reports\/([a-f0-9-]{36})\/issues\/([a-f0-9]{16})$/);
      if(req.method==='PATCH'&&review){const r=store.get(review[1]);if(!r)return failure(res,404,'Report not found.');if(!r.issues.find(x=>x.id===review[2]))return failure(res,404,'Issue not found.');const x=await body(req);if(!['open','in-progress','fixed','accepted-risk'].includes(x.status)||typeof x.note!=='string'||x.note.length>1000)return failure(res,400,'Invalid review.');return send(res,200,{reviews:store.updateReview(review[1],review[2],x.status,x.note)});}
      const result=rel.match(/^\/api\/reports\/([a-f0-9-]{36})$/);
      if(result){if(req.method==='GET'){const r=store.get(result[1]);return r?send(res,200,r):failure(res,404,'Report not found.');}if(req.method==='DELETE'){const removed=store.delete(result[1]);const f=join(shotDir,result[1]+'.jpg');if(existsSync(f))unlinkSync(f);return send(res,200,{deleted:removed});}}
      return failure(res,404,'Unknown API endpoint.');
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return failure(res,405,'Method not allowed.');
    const relative=rel==='/'?'/index.html':rel;const pathOnDisk=resolve(root,'.'+relative);
    if(!pathOnDisk.startsWith(root+'/'))return failure(res,403,'Forbidden.');
    const filepath=existsSync(pathOnDisk)?pathOnDisk:join(root,'index.html');
    return send(res,200,readFileSync(filepath),types[extname(filepath)]||'application/octet-stream');
  }catch(e){const userErrors=/invalid|valid |approved|local |standard ports|shorter|not allowed|domain |URL/i.test(e.message);failure(res,userErrors?400:500,userErrors?e.message:`Request failed: ${String(e.message).slice(0,240)}`);}
});
const port=Number(process.env.PORT||4117), host=process.env.HOST||'127.0.0.1';
app.listen(port,host,()=>console.log(`AccessBloom listening on http://${host}:${port}${base}/`));
process.on('SIGTERM',()=>{app.close(()=>{store.close();process.exit(0);});});
