import test from 'node:test';
import assert from 'node:assert/strict';
import {privateIP,parseAllowed,normalizeUrl,authorized} from '../server/security.js';
import {prepareReport,compareReports,issueId,makeCsv} from '../server/report.js';
import {createDemo} from '../server/demo.js';
import {createStore} from '../server/store.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('IP filter rejects private IPv4/v6, addresses for metadata, documentation',()=>{
 for (const ip of ['127.0.0.1','10.4.5.6','172.17.0.1','192.168.1.2','169.254.169.254','100.100.100.200','192.0.2.1','203.0.113.3','::1','fc00::1','fe80::1','::ffff:127.0.0.1']) assert.equal(privateIP(ip),true,ip);
 for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111']) assert.equal(privateIP(ip),false,ip);
});
test('URL validation permits standard public hostname only',()=>{
 assert.equal(normalizeUrl('https://example.com/path#anchor').href,'https://example.com/path');
 for (const url of ['file:///etc/passwd','http://localhost','http://127.0.0.1','http://router.local','ftp://example.com','https://user:pass@example.com','https://example.com:8989/']) assert.throws(()=>normalizeUrl(url),undefined,url);
 assert.deepEqual(parseAllowed('vik.ooo, example.com ,'),['vik.ooo','example.com']);
});
test('owner access uses exact constant-time token check',()=>{const token='a'.repeat(32);assert.equal(authorized({headers:{authorization:'Bearer '+token}},token),true);assert.equal(authorized({headers:{authorization:'Bearer '+('b'.repeat(32))}},token),false);assert.equal(authorized({headers:{}},token),false);assert.equal(authorized({headers:{authorization:'Bearer '+token}},'short'),false);});
test('demo report has distinct verified source issue ids, no compliance claim',()=>{const report=createDemo();assert.equal(report.issues.length,5);assert.equal(new Set(report.issues.map(i=>i.id)).size,5);assert.equal(report.aiStatus,'illustrative-demo');assert.match(report.reviewNotice,/not prove WCAG compliance/i);assert.match(report.issues.find(i=>i.rule==='label').fix,/label/);});
test('difference logic tracks stable selectors and missing/added issues',()=>{const old=createDemo(),next=structuredClone(old);next.id='other';next.issues=next.issues.slice(2);const diff=compareReports(old,next);assert.equal(diff.resolved.length,2);assert.equal(diff.introduced.length,0);assert.equal(diff.unchanged.length,3);assert.equal(issueId('label','#email'),issueId('label','#email'));});
test('report CSV quotes unsafe content and includes WCAG',()=>{const r=createDemo();r.issues[0].recommendation='Say "hello", ok';const csv=makeCsv(r);assert.match(csv,/"Say ""hello"", ok"/);assert.equal(csv.trim().split('\n').length,r.issues.length+1);});
test('SQLite stores reports and reviewer statuses',()=>{const tmp=mkdtempSync(join(tmpdir(),'accessbloom-test-'));try{const db=createStore(tmp),r=prepareReport({url:'https://vik.ooo',violations:[]});db.put(r);assert.equal(db.list().length,1);assert.equal(db.get(r.id).score,100);db.updateReview(r.id,'fake','in-progress','Tested keyboard');assert.equal(db.get(r.id).reviews.fake.note,'Tested keyboard');assert.equal(db.delete(r.id),true);assert.equal(db.list().length,0);db.close();}finally{rmSync(tmp,{recursive:true,force:true});}});
