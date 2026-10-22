import crypto from 'node:crypto';

export const issueId=(rule,selector)=>crypto.createHash('sha256').update(`${rule}|${selector}`).digest('hex').slice(0,16);
export function prepareReport({url,title,violations=[],incomplete=[],passes=0,screenshot=null,ai={},isDemo=false}) {
  const issues = violations.flatMap(v=>v.nodes.map((n,i)=>({
    id:issueId(v.id, n.target?.join(' ') || `item-${i}`),rule:v.id,impact:v.impact || 'moderate',title:v.help || v.id,
    description:v.description || '',helpUrl:v.helpUrl || '',wcag:v.tags?.filter(t=>/^(wcag|best-practice)/.test(t)) || [],
    selector:n.target?.join(' ') || '',html:String(n.html||'').slice(0,1100),failureSummary:String(n.failureSummary||'').slice(0,1500),
    explanation: '',recommendation:'',fix:'',confidence:'automated',status:'open'
  })));
  const counts = {critical:0,serious:0,moderate:0,minor:0};
  for(const x of issues) counts[x.impact] = (counts[x.impact]||0)+1;
  const score = Math.max(0,Math.round(100 - counts.critical*16 - counts.serious*10 - counts.moderate*5 - counts.minor*2));
  return {id:crypto.randomUUID(),url,title:title||new URL(url).hostname,createdAt:new Date().toISOString(),isDemo,screenshot,
    issues,counts,score,passes,incomplete:incomplete.length,aiStatus:ai.status||'not-configured',aiModel:ai.model||null,
    aiSummary:ai.summary||'',strengths:ai.strengths||[],priorities:ai.priorities||[],manualChecks:[
      'Navigate the page with keyboard only; confirm focus order and visible focus.',
      'Check screen-reader reading order and names for important controls.',
      'Zoom to 200% and test narrow mobile layouts without losing content.',
      'Check error messages, form recovery, and dynamic announcements.',
      'Test visual contrast in complex backgrounds and disabled states.'
    ],reviewNotice:'Automated checks do not prove WCAG compliance. AI suggestions may be incorrect; verify changes with people and assistive technologies.'};
}
export function compareReports(oldReport,newReport){
  if(!oldReport || !newReport) throw new Error('Select two reports.');
  const a=new Set(oldReport.issues.map(i=>i.id)),b=new Set(newReport.issues.map(i=>i.id));
  const resolved=oldReport.issues.filter(i=>!b.has(i.id));
  const introduced=newReport.issues.filter(i=>!a.has(i.id));
  const unchanged=newReport.issues.filter(i=>a.has(i.id));
  return {previousId:oldReport.id,currentId:newReport.id,resolved,introduced,unchanged,scoreDelta:newReport.score-oldReport.score};
}
export function makeCsv(report){const rows=[['Severity','Rule','Title','Selector','WCAG','Review status','Recommendation']];for(const i of report.issues){const review=report.reviews?.[i.id]; rows.push([i.impact,i.rule,i.title,i.selector,i.wcag.join('; '),review?.status||'open',i.recommendation]);}return rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n');}
