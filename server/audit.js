import { verifyExternal, parseAllowed } from './security.js';
import { prepareReport } from './report.js';
import { enrichReport } from './ai.js';

export async function auditPage(value, {allowedHosts=parseAllowed(process.env.SCAN_ALLOWED_HOSTS||'')}={}) {
  const start=await verifyExternal(value, allowedHosts);
  const [{ chromium }, { default: AxeBuilder }] = await Promise.all([import('playwright'),import('@axe-core/playwright')]);
  let browser;
  try {
    browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-first-run']});
    const context=await browser.newContext({viewport:{width:1366,height:880},deviceScaleFactor:1,serviceWorkers:'block',acceptDownloads:false,
      permissions:[],ignoreHTTPSErrors:false,javaScriptEnabled:true});
    // Block private/loopback request targets, unsupported schemes, and external navigations.
    // Production still needs container-level egress firewall isolation against DNS rebinding.
    await context.route('**/*', async route=>{
      try {
        const u=new URL(route.request().url());
        if(!['http:','https:'].includes(u.protocol)){await route.abort();return;}
        if(route.request().isNavigationRequest() && u.hostname.toLowerCase() !== start.hostname.toLowerCase()){await route.abort();return;}
        await verifyExternal(u.toString());
        await route.continue();
      }catch {await route.abort().catch(()=>{});}
    });
    const page=await context.newPage();
    page.setDefaultTimeout(12000);
    const response=await page.goto(start.toString(),{waitUntil:'domcontentloaded',timeout:25000});
    if(!response || response.status()>=400) throw new Error(`Website returned HTTP ${response?.status()||'error'}.`);
    await page.waitForTimeout(1200);
    const title=(await page.title()).slice(0,160);
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']).analyze();
    const screenshotBuffer=await page.screenshot({type:'jpeg',quality:58,fullPage:false,animations:'disabled',timeout:10000});
    let report=prepareReport({url:start.toString(),title,violations:axe.violations,incomplete:axe.incomplete,passes:axe.passes.length});
    report=await enrichReport(report,screenshotBuffer);
    return {report,screenshotBuffer};
  }finally {if(browser) await browser.close();}
}
