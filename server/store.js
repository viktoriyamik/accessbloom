import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function createStore(dataDir) {
  mkdirSync(dataDir,{recursive:true,mode:0o700});
  const db = new DatabaseSync(join(dataDir,'accessbloom.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, url TEXT NOT NULL, hostname TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS reviews (report_id TEXT NOT NULL, issue_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, PRIMARY KEY (report_id, issue_id));
  CREATE INDEX IF NOT EXISTS idx_reports_host ON reports(hostname,created_at DESC);`);
  const parse = row => row ? {...JSON.parse(row.data),reviews:getReviews(row.id)} : null;
  function getReviews(id) {
    return Object.fromEntries(db.prepare('SELECT issue_id,status,note,updated_at FROM reviews WHERE report_id=?').all(id).map(r=>[r.issue_id,{status:r.status,note:r.note,updatedAt:r.updated_at}]));
  }
  return {
    put(report) {db.prepare('INSERT INTO reports(id,url,hostname,created_at,data) VALUES(?,?,?,?,?)').run(report.id,report.url,new URL(report.url).hostname,report.createdAt,JSON.stringify(report));},
    get(id){return parse(db.prepare('SELECT * FROM reports WHERE id=?').get(id));},
    list(){return db.prepare('SELECT id,url,created_at,data FROM reports ORDER BY created_at DESC LIMIT 80').all().map(r=>{const p=JSON.parse(r.data);return {id:r.id,url:r.url,title:p.title,createdAt:r.created_at,score:p.score,counts:p.counts,issues:p.issues.map(i=>({id:i.id,title:i.title,selector:i.selector,impact:i.impact})),aiStatus:p.aiStatus,isDemo:false,summary:true};});},
    updateReview(id,issue,status,note){db.prepare(`INSERT INTO reviews(report_id,issue_id,status,note,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(report_id,issue_id) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at`).run(id,issue,status,note,new Date().toISOString());return getReviews(id);},
    delete(id){db.prepare('DELETE FROM reviews WHERE report_id=?').run(id); return db.prepare('DELETE FROM reports WHERE id=?').run(id).changes > 0;},
    close(){db.close();}
  };
}
