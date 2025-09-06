import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb } from '../lib/db.js';
import { runAutoDiscovery } from '../jobs/auto-discovery.js';
import { runMediaSync } from '../jobs/media-sync.js';
import { runBadgesSync } from '../jobs/badges-sync.js';

const r = Router();

// Simple SSE log stream. Streams tail of data/server.log if present; otherwise streams nothing.
r.get('/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const logPath = path.resolve('data', 'server.log');
  let lastSize = 0;
  try { lastSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0; } catch {}

  let closed = false;
  const interval = setInterval(() => {
    if (closed) return;
    try {
      if (!fs.existsSync(logPath)) return;
      const st = fs.statSync(logPath);
      if (st.size > lastSize) {
        const stream = fs.createReadStream(logPath, { start: lastSize, end: st.size });
        let buf = '';
        stream.on('data', (c) => { buf += c.toString(); });
        stream.on('end', () => {
          lastSize = st.size;
          const lines = buf.split('\n').filter(Boolean);
          for (const line of lines) {
            res.write(`data: ${JSON.stringify({ ts: Date.now(), line })}\n\n`);
          }
        });
      }
    } catch (e) {
      // ignore
    }
  }, 1000);

  req.on('close', () => { closed = true; clearInterval(interval); });
});

// Run auto-discovery (existing)
r.post('/auto-discovery/run', async (req, res) => {
  try {
    const debug = req.query.debug === '1';
    const out = await runAutoDiscovery(250, debug);
    res.json({ ok: true, ...out });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// GET KPIs
r.get('/kpis', (_req, res) => {
  try {
    const db = getDb();
    const universes = db.prepare(`SELECT COUNT(*) AS c FROM universes`).get().c as number;
    const tracked = db.prepare(`SELECT COUNT(*) AS c FROM universes WHERE is_tracked=1`).get().c as number;
    const badges = db.prepare(`SELECT COUNT(*) AS c FROM badges`).get().c as number;
    const mediaRows = db.prepare(`SELECT COUNT(*) AS c FROM universes_media`).get().c as number;
    const thumbs = db.prepare(`SELECT COUNT(*) AS c FROM universes_media WHERE url IS NOT NULL`).get().c as number;
    const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'app.db');
    let dbSize = 0;
    try { dbSize = fs.statSync(dbPath).size; } catch {}
    res.json({ universes, tracked, badges, mediaRows, thumbsPersisted: thumbs, dbSizeBytes: dbSize });
  } catch (e:any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Known jobs and their last-run summary files
const JOBS: Record<string, { summary: string; failures?: string }> = {
  'media-sync': { summary: path.resolve('data', 'media-sync-last-run.json'), failures: path.resolve('data', 'media-sync-failures.jsonl') },
  'badges-sync': { summary: path.resolve('data', 'badges-sync-last-run.json'), failures: path.resolve('data', 'badges-sync-failures.jsonl') }
};

// POST /jobs/run?name=media-sync - trigger a known job asynchronously
r.post('/jobs/run', async (req, res) => {
  try {
    const name = String(req.query.name || '');
    if (!name) return res.status(400).json({ ok:false, error: 'name required' });
    if (!['media-sync','badges-sync','auto-discovery'].includes(name)) return res.status(400).json({ ok:false, error: 'unknown job' });

    const runId = Date.now();
    const startEntry = { runId, name, ts: new Date().toISOString(), status: 'started' };
    try { fs.mkdirSync(path.resolve('data'), { recursive: true }); } catch {}
    const manualPath = path.resolve('data', `${name}-manual-runs.jsonl`);
    try { fs.appendFileSync(manualPath, JSON.stringify(startEntry) + '\n'); } catch {}

    // prepare log and progress paths
    const logPath = path.resolve('data', `${name}-manual-run-${runId}.log`);
    const progressPath = path.resolve('data', `${name}-manual-run-${runId}-progress.json`);
    const initialProgress = { runId, name, ts: new Date().toISOString(), status: 'started', percent: 0, lastLine: '' };
    try { fs.writeFileSync(progressPath, JSON.stringify(initialProgress)); } catch {}

    try {
      const { spawn } = await import('child_process');
      let script = '';
      if (name === 'media-sync') script = 'src/jobs/run-media-sync.ts';
      if (name === 'badges-sync') script = 'src/jobs/run-badges-sync.ts';
      if (name === 'auto-discovery') script = 'src/jobs/auto-discovery.ts';
      if (!script) return res.status(400).json({ ok:false, error:'no script' });

      const outStream = fs.createWriteStream(logPath, { flags: 'a' });

      const child = spawn('npx', ['tsx', script], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: process.cwd(),
        env: process.env,
      });

      // buffer incomplete lines
      let stdoutBuf = '';
      child.stdout?.on('data', (b: Buffer) => {
        const s = b.toString();
        outStream.write(s);
        stdoutBuf += s;
        const parts = stdoutBuf.split('\n');
        stdoutBuf = parts.pop() || '';
        for (const line of parts) {
          // prefer structured JSON progress emitted by jobs
          try {
            const parsed = JSON.parse(line);
            if (parsed && parsed.kind === 'progress') {
              const progressObj: any = JSON.parse(fs.readFileSync(progressPath, 'utf8')) || {};
              progressObj.lastLine = parsed.msg ?? line;
              if (typeof parsed.percent === 'number') progressObj.percent = parsed.percent;
              if (parsed.universe_id) progressObj.universe_id = parsed.universe_id;
              if (parsed.status) progressObj.status = parsed.status;
              fs.writeFileSync(progressPath, JSON.stringify(progressObj));
              continue;
            }
          } catch (e) {
            // not JSON — fall back to regex parsing
          }
          try {
            const m = line.match(/processing.*\((\d+)\/(\d+)\)/i);
            let percent = null as number | null;
            if (m) {
              const cur = Number(m[1]);
              const tot = Number(m[2]);
              if (tot > 0) percent = Math.round((cur / tot) * 100);
            }
            const summaryComplete = line.match(/complete.*success=(\d+)/i);
            const progressObj: any = JSON.parse(fs.readFileSync(progressPath, 'utf8')) || {};
            progressObj.lastLine = line;
            if (percent != null) progressObj.percent = percent;
            if (summaryComplete) { progressObj.status = 'complete'; progressObj.percent = 100; }
            fs.writeFileSync(progressPath, JSON.stringify(progressObj));
          } catch (e) { /* ignore parse/write errors */ }
        }
      });

      let stderrBuf = '';
      child.stderr?.on('data', (b: Buffer) => {
        const s = b.toString();
        outStream.write(s);
        stderrBuf += s;
        const parts = stderrBuf.split('\n');
        stderrBuf = parts.pop() || '';
        for (const line of parts) {
          try {
            const progressObj: any = JSON.parse(fs.readFileSync(progressPath, 'utf8')) || {};
            progressObj.lastLine = line;
            progressObj.status = progressObj.status || 'started';
            fs.writeFileSync(progressPath, JSON.stringify(progressObj));
          } catch (e) {}
        }
      });

      child.on('close', (code:number, signal:any) => {
        try {
          outStream.end();
        } catch {}
        const finished = { runId, name, ts: new Date().toISOString(), status: code === 0 ? 'complete' : 'failed', exitCode: code };
        try { fs.appendFileSync(manualPath, JSON.stringify(finished) + '\n'); } catch {}
        try {
          const progressObj: any = JSON.parse(fs.existsSync(progressPath) ? fs.readFileSync(progressPath, 'utf8') : '{}') || {};
          progressObj.status = finished.status;
          progressObj.exitCode = code;
          progressObj.finishedAt = finished.ts;
          progressObj.percent = finished.status === 'complete' ? 100 : (progressObj.percent || 0);
          fs.writeFileSync(progressPath, JSON.stringify(progressObj));
        } catch (e) {}
      });

      // detach but keep parent able to write logs
      child.unref();
    } catch (e:any) {
      // fallback: run in-process and update progress file when done
      (async ()=>{
        try {
          if (name === 'media-sync') await runMediaSync();
          if (name === 'badges-sync') await runBadgesSync();
          if (name === 'auto-discovery') await runAutoDiscovery(250, false);
          const finished = { runId, name, ts: new Date().toISOString(), status: 'complete' };
          try { fs.appendFileSync(manualPath, JSON.stringify(finished) + '\n'); } catch {}
          try { fs.writeFileSync(progressPath, JSON.stringify({ ...initialProgress, status: 'complete', percent: 100, finishedAt: finished.ts })); } catch {}
        } catch (ex:any) {
          try { fs.appendFileSync(manualPath, JSON.stringify({ runId, name, ts: new Date().toISOString(), status: 'failed', error: String(ex?.message || ex) }) + '\n'); } catch {}
          try { fs.writeFileSync(progressPath, JSON.stringify({ ...initialProgress, status: 'failed', error: String(ex?.message || ex) })); } catch {}
        }
      })();
    }

    res.json({ ok: true, runId });
  } catch (e:any) { res.status(500).json({ ok:false, error: String(e?.message || e) }); }
});

// GET raw log for a manual run
r.get('/jobs/log', (req, res) => {
  try {
    const name = String(req.query.name || '');
    const runId = String(req.query.runId || '');
    if (!name || !runId) return res.status(400).json({ error: 'name and runId required' });
    const logPath = path.resolve('data', `${name}-manual-run-${runId}.log`);
    if (!fs.existsSync(logPath)) return res.status(404).json({ error: 'not found' });
    const content = fs.readFileSync(logPath, 'utf8');
    res.type('text/plain').send(content);
  } catch (e:any) { res.status(500).json({ ok:false, error: String(e?.message || e) }); }
});

// SSE tail for a manual run log
r.get('/jobs/log/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const name = String(req.query.name || '');
  const runId = String(req.query.runId || '');
  if (!name || !runId) { res.status(400).end(); return; }
  const logPath = path.resolve('data', `${name}-manual-run-${runId}.log`);
  let lastSize = 0;
  try { lastSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0; } catch {}

  let closed = false;
  const interval = setInterval(() => {
    if (closed) return;
    try {
      if (!fs.existsSync(logPath)) return;
      const st = fs.statSync(logPath);
      if (st.size > lastSize) {
        const stream = fs.createReadStream(logPath, { start: lastSize, end: st.size });
        let buf = '';
        stream.on('data', (c) => { buf += c.toString(); });
        stream.on('end', () => {
          lastSize = st.size;
          const lines = buf.split('\n').filter(Boolean);
          for (const line of lines) {
            res.write(`data: ${JSON.stringify({ ts: Date.now(), line })}\n\n`);
          }
        });
      }
    } catch (e) {}
  }, 800);

  req.on('close', () => { closed = true; clearInterval(interval); });
});

// GET jobs list with last-run summary if available
r.get('/jobs', (_req, res) => {
  try {
    const out: any = {};
    for (const [name, info] of Object.entries(JOBS)) {
      let summary = null;
      try { if (fs.existsSync(info.summary)) summary = JSON.parse(fs.readFileSync(info.summary, 'utf8')); } catch {}
      // tail last 20 manual runs if present
      const manualPath = path.resolve('data', `${name}-manual-runs.jsonl`);
      let manualRuns: any[] = [];
      try {
        if (fs.existsSync(manualPath)) {
          const lines = fs.readFileSync(manualPath, 'utf8').split('\n').filter(Boolean).slice(-20).reverse();
          manualRuns = lines.map(l=>{ try { return JSON.parse(l); } catch { return { raw: l }; } });
        }
      } catch {}
      out[name] = { summary, hasFailures: info.failures ? fs.existsSync(info.failures) : false, manualRuns };
    }
    res.json(out);
  } catch (e:any) { res.status(500).json({ ok:false, error: String(e?.message || e) }); }
});

// GET job failures (JSONL) for a given job
r.get('/job-failures', (req, res) => {
  try {
    const job = String(req.query.job || '');
    if (!job || !JOBS[job] || !JOBS[job].failures) return res.status(400).json({ error: 'job missing or unknown' });
    const pathF = JOBS[job].failures as string;
    if (!fs.existsSync(pathF)) return res.json({ items: [] });
    const lines = fs.readFileSync(pathF, 'utf8').split('\n').filter(Boolean).slice(-200).reverse();
    const items = lines.map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } });
    res.json({ items });
  } catch (e:any) { res.status(500).json({ ok:false, error: String(e?.message || e) }); }
});

// GET progress for a manual run: /jobs/progress?name=media-sync&runId=123
r.get('/jobs/progress', (req, res) => {
  try {
    const name = String(req.query.name || '');
    const runId = String(req.query.runId || '');
    if (!name || !runId) return res.status(400).json({ error: 'name and runId required' });
    const progressPath = path.resolve('data', `${name}-manual-run-${runId}-progress.json`);
    if (!fs.existsSync(progressPath)) return res.status(404).json({ error: 'not found' });
    const j = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    res.json(j);
  } catch (e:any) { res.status(500).json({ ok:false, error: String(e?.message || e) }); }
});

// Simple table viewer (read-only, limited)
r.get('/table/:name', (req, res) => {
  try {
    const table = String(req.params.name || '');
    const limit = Math.min(1000, Number(req.query.limit || 200));
    const db = getDb();
    // Basic whitelist to avoid arbitrary queries; derive tables from sqlite_master
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r:any)=>r.name);
    if (!tables.includes(table)) return res.status(404).json({ error: 'table not found' });
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ROWID DESC LIMIT ?`).all(limit);
    res.json({ table, columns: cols, rows });
  } catch (e:any) { res.status(500).json({ ok:false, error: String(e?.message || e) }); }
});

export default r;
