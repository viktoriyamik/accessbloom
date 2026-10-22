import {chromium} from 'playwright';
const ws='ws://127.0.0.1:4120/';
const browser=await chromium.connect(ws,{timeout:10000});
try {
 const context=await browser.newContext({proxy:{server:'http://accessbloom-egress-proxy:3128'},ignoreHTTPSErrors:false,serviceWorkers:'block'});
 try {
  const page=await context.newPage();
  const response=await page.goto('https://example.com',{waitUntil:'domcontentloaded',timeout:20000});
  if(response?.status()!==200)throw Error('Public site scan failed: '+response?.status());
  console.log('PASS: browser can visit a public HTTPS website through the proxy');
  const bad=await context.newPage();
  let blocked=false;
  try {const result=await bad.goto('http://127.0.0.1:3001',{timeout:5000}); const status=result?.status(); console.log('Private target response HTTP',status??'none'); if(status===403||status===407) blocked=true; else throw Error('UNSAFE: private target returned HTTP '+(status??'none'));}
  catch(error){if(String(error.message).startsWith('UNSAFE:'))throw error; console.log('Private target blocked by network:',String(error.message).slice(0,160));blocked=true;}
  if(!blocked)throw Error('UNSAFE: browser could access local address');
  console.log('PASS: browser cannot reach host private API');
 }finally{await context.close();}
}finally{await browser.close();}
