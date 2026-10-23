import { verifyExternal, parseAllowed } from './security.js';
import { prepareReport } from './report.js';
import { enrichReport } from './ai.js';

export async function auditPage(value, {allowedHosts=parseAllowed(process.env.SCAN_ALLOWED_HOSTS||'')}={}) {
  const start=await verifyExternal(value, allowedHosts);
  if(process.env.PUBLIC_SCANS_ENABLED==='true' && start.protocol!=='https:') throw new Error('Public scanning accepts HTTPS websites only.');
  const [{ chromium }, { default: AxeBuilder }] = await Promise.all([import('playwright'),import('@axe-core/playwright')]);
  let browser;
  let stage='connecting to isolated browser';
  const stageLog=name=>{stage=name;console.info('[scan-stage]',name);};
  try {
    if(process.env.AUDIT_BROWSER_WS){
      browser=await chromium.connect(process.env.AUDIT_BROWSER_WS,{timeout:10000});
    }else{
      if(process.env.PUBLIC_SCANS_ENABLED==='true') throw new Error('Public scanning requires an isolated remote browser.');
      browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-first-run']});
    }
    stageLog('creating browser context');
    const context=await browser.newContext({viewport:{width:1366,height:880},deviceScaleFactor:1,serviceWorkers:'block',acceptDownloads:false,
      ...(process.env.AUDIT_BROWSER_WS?{proxy:{server:'http://accessbloom-egress-proxy:3128'}}:{}),
      permissions:[],ignoreHTTPSErrors:false,javaScriptEnabled:true});
    // Block private/loopback request targets, unsupported schemes, and external navigations.
    // Production still needs container-level egress firewall isolation against DNS rebinding.
    const checkedHosts=new Map();
    await context.route('**/*', async route=>{
      try {
        const u=new URL(route.request().url());
        if(!['http:','https:'].includes(u.protocol)){await route.abort();return;}
        if(route.request().isNavigationRequest() && u.hostname.toLowerCase() !== start.hostname.toLowerCase()){await route.abort();return;}
        if(process.env.AUDIT_BROWSER_WS && u.protocol!=='https:'){await route.abort();return;}
        const hostname=u.hostname.toLowerCase();
        if(!checkedHosts.has(hostname)) checkedHosts.set(hostname,verifyExternal(u.toString()).catch(error=>{checkedHosts.delete(hostname);throw error;}));
        await checkedHosts.get(hostname);
        await route.continue();
      }catch {await route.abort().catch(()=>{});}
    });
    stageLog('opening tab');
    const page=await context.newPage();
    page.setDefaultTimeout(12000);
    stageLog('navigating to website');
    const response=await page.goto(start.toString(),{waitUntil:'domcontentloaded',timeout:30000});
    if(!response || response.status()>=400) throw new Error(`Website returned HTTP ${response?.status()||'error'}.`);
    stageLog('checking accessibility');
    await page.waitForTimeout(850);
    const title=(await page.title()).slice(0,160);
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']).analyze();
    stageLog('capturing screenshot');
    const screenshotBuffer=await page.screenshot({type:'jpeg',quality:82,fullPage:false,animations:'disabled',timeout:10000});
    let report=prepareReport({url:start.toString(),title,violations:axe.violations,incomplete:axe.incomplete,passes:axe.passes.length});
    stageLog('generating AI guidance');
    report=await enrichReport(report,screenshotBuffer);
    stageLog('finished');
    return {report,screenshotBuffer};
  }catch(error){console.error('[scan-stage] failed at',stage,':',error.message);throw new Error('Scan failed while '+stage+': '+error.message);}
  finally {if(browser) await browser.close();}
}
