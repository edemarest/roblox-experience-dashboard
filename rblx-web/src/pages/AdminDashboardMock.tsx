import { useEffect, useState, useRef } from 'react';
import styles from './AdminDashboardMock.module.css';

type KPIs = { universes:number; tracked:number; badges:number; mediaRows:number; thumbsPersisted:number; dbSizeBytes:number };

export default function AdminDashboardMock() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [jobs, setJobs] = useState<Record<string, any> | null>(null);
  const [failures, setFailures] = useState<any[]>([]);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [modalItem, setModalItem] = useState<any | null>(null);
  const [runningJobs, setRunningJobs] = useState<Record<string, number>>({});
  const [runProgress, setRunProgress] = useState<Record<string, any>>({});
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [logRun, setLogRun] = useState<{ name: string; runId: string } | null>(null);
  const [logContent, setLogContent] = useState<string[]>([]);
  const [logSource, setLogSource] = useState<EventSource | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when log updates
  useEffect(()=>{
    try {
      const el = logContainerRef.current;
      if (el) { el.scrollTop = el.scrollHeight; }
    } catch (e) {}
  }, [logContent]);

  useEffect(()=>{
    fetch('/api/v1/admin/kpis').then(r=>r.json()).then(setKpis).catch(()=>setKpis(null));
    fetch('/api/v1/admin/jobs').then(r=>r.json()).then(setJobs).catch(()=>setJobs(null));
    fetch('/api/v1/admin/job-failures?job=media-sync').then(r=>r.json()).then((j)=>setFailures(j.items||[])).catch(()=>setFailures([]));
    fetch('/api/v1/admin/table/universes?limit=10').then(r=>r.json()).then((j)=>setSampleRows(j.rows||[])).catch(()=>setSampleRows([]));

    // Open SSE for live logs
    try {
      const es = new EventSource('/api/v1/admin/logs/stream');
      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          setLiveLogs(l => [...l.slice(-199), `[${new Date(d.ts).toLocaleTimeString()}] ${d.line}`]);
        } catch (e) {}
      };
      es.onerror = () => { es.close(); };
      return ()=>{ es.close(); };
    } catch (e) {
      // ignore
    }
  },[]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Admin — System Dashboard</h1>
        <div className={styles.headerActions}>
          <button onClick={()=>{ window.location.reload(); }}>Refresh</button>
          <button onClick={async ()=>{ await fetch('/api/v1/admin/auto-discovery/run', { method: 'POST' }); alert('triggered'); }}>Run auto-discovery</button>
        </div>
      </header>

      <section className={styles.kpiRow}>
        {kpis ? (
          [
            { label: 'Universes', value: String(kpis.universes) },
            { label: 'Tracked', value: String(kpis.tracked) },
            { label: 'Badges', value: String(kpis.badges) },
            { label: 'Media rows', value: String(kpis.mediaRows) },
            { label: 'Thumbs persisted', value: String(kpis.thumbsPersisted) },
            { label: 'DB size', value: `${Math.round(kpis.dbSizeBytes/1024/1024)} MB` }
          ].map(k => (
            <div key={k.label} className={styles.kpiCard}>
              <div className={styles.kpiLabel}>{k.label}</div>
              <div className={styles.kpiValue}>{k.value}</div>
            </div>
          ))
        ) : (
          <div>Loading KPIs…</div>
        )}
      </section>

      <section className={styles.grid}>
        <div className={styles.colMain}>
          <div className={styles.card}>
            <h3>Jobs</h3>
            <div className={styles.jobsList}>
              {jobs ? Object.entries(jobs).map(([name, j]) => (
                <div key={name} className={styles.jobRow}>
                  <div className={styles.jobName}>{name}</div>
                  <div className={styles.jobMeta}>Last: {j.summary?.ts ?? '—'}</div>
                  <div className={styles.jobCounts}>✅ {j.summary?.success ?? '—'} ⛔ {j.summary?.failed ?? (j.summary?.failed===0?0:'—')}</div>
                  <div style={{display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}}>
                    <div style={{width:120,height:8,background:'#0b0b0c',borderRadius:4,overflow:'hidden',marginBottom:6}}>
                      {runningJobs[name] ? <div style={{height:'100%',width:'100%',background:'linear-gradient(90deg,#3ae,#0bf)',transition:'width 1s'}}> </div> : null}
                    </div>
                    <div className={styles.jobActions}>
                    <button onClick={async()=>{
                      try {
                        setRunningJobs(r=>({ ...r, [name]: Date.now() }));
                        const resp = await fetch(`/api/v1/admin/jobs/run?name=${encodeURIComponent(String(name))}`, { method: 'POST' });
                        const body = await resp.json();
                        const runId = body.runId;
                        // poll jobs endpoint once after a short delay
                        setTimeout(()=>{ fetch('/api/v1/admin/jobs').then(r=>r.json()).then(setJobs); }, 1500);
                        // start polling progress for this runId
                        const poll = setInterval(async ()=>{
                          try {
                            const p = await fetch(`/api/v1/admin/jobs/progress?name=${encodeURIComponent(name)}&runId=${encodeURIComponent(runId)}`);
                            if (p.ok) {
                              const pj = await p.json();
                              setRunProgress(prev => ({ ...prev, [runId]: pj }));
                              if (pj.status === 'complete' || pj.status === 'failed') {
                                clearInterval(poll);
                                // refresh jobs and manual runs
                                setTimeout(()=>{ fetch('/api/v1/admin/jobs').then(r=>r.json()).then(setJobs); }, 500);
                                setTimeout(()=>{ setRunningJobs(r=>{ const copy = {...r}; delete copy[name]; return copy; }); }, 1000);
                              }
                            }
                          } catch (e) { /* ignore */ }
                        }, 1500);
                      } finally {
                        // keep runningJobs cleared by poll completion above
                      }
                      }}>{runningJobs[name] ? 'Running…' : 'Run'}</button>
                      <button onClick={async()=>{ const resp = await fetch(`/api/v1/admin/job-failures?job=${encodeURIComponent(name)}`); const j = await resp.json(); setFailures(j.items||[]); }}>Failures</button>
                      <button onClick={async()=>{
                        // open log viewer for latest manual run if present
                        const run = j.manualRuns && j.manualRuns[0];
                        if (!run) { alert('no manual run found'); return; }
                        setLogRun({ name, runId: run.runId });
                        // close any existing source
                        try { logSource?.close(); } catch {}
                        setLogContent([]);
                        // fetch full log (may not exist yet) — show waiting placeholder if absent
                        try {
                          const r = await fetch(`/api/v1/admin/jobs/log?name=${encodeURIComponent(name)}&runId=${encodeURIComponent(run.runId)}`);
                          if (r.ok) {
                            const txt = await r.text();
                            const lines = txt ? txt.split('\n').filter(Boolean) : [];
                            setLogContent(lines.length ? lines : ['[waiting for log…]']);
                          } else {
                            setLogContent(['[waiting for log…]']);
                          }
                        } catch (e) { setLogContent(['[waiting for log…]']); }
                        // open SSE stream (append new lines as they arrive); accept JSON or plain data
                        try {
                          const es = new EventSource(`/api/v1/admin/jobs/log/stream?name=${encodeURIComponent(name)}&runId=${encodeURIComponent(run.runId)}`);
                          es.onmessage = (ev)=>{
                            try {
                              const parsed = JSON.parse(ev.data);
                              const line = typeof parsed === 'string' ? parsed : parsed.line ?? String(ev.data);
                              setLogContent((c: string[])=>[...c, String(line)]);
                            } catch (e) {
                              // fallback to raw data
                              setLogContent((c: string[])=>[...c, ev.data]);
                            }
                          };
                          es.onerror = ()=>{ /* keep open; server may create file later */ };
                          setLogSource(es);
                        } catch (e) { /* ignore */ }
                      }}>View Log</button>
                  </div>
                  </div>
                  {j.manualRuns && j.manualRuns.length ? (
                    <div style={{marginLeft:12,marginTop:8,flexBasis:'100%'}}>
                      <div style={{fontSize:12,color:'#9aa0a6'}}>Recent runs</div>
                      <ul style={{listStyle:'none',padding:0,margin:6}}>
                        {j.manualRuns.map((r:any, idx:number)=> (
                          <li key={idx} style={{fontSize:12,color:'#cfd4d8'}}>
                            {r.ts} — {r.status}{r.error ? ` — ${r.error}` : ''}
                            {runProgress[r.runId] ? ` — ${runProgress[r.runId].percent ?? 0}%` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )) : <div>Loading jobs…</div>}
            </div>
          </div>

          <div className={styles.card}>
            <h3>Database explorer (universes)</h3>
            <table className={styles.table}>
              <thead>
                <tr>{(sampleRows[0] ? Object.keys(sampleRows[0]) : ['universe_id','name','...']).slice(0,4).map(h=> <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {sampleRows.map((r:any, idx:number) => (
                  <tr key={idx}>
                    {Object.values(r).slice(0,4).map((v:any,i:number)=> <td key={i}>{String(v)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{marginTop:8}}><button onClick={async ()=>{ const w=window.open('/admin/viewer','_blank'); if(!w) alert('open viewer manually'); }}>Open table viewer</button></div>
          </div>

          <div className={styles.card}>
            <h3>Time-series (mock)</h3>
            <div className={styles.placeholder}>[sparkline charts here]</div>
          </div>
        </div>

        <aside className={styles.colSide}>
          <div className={styles.card}>
            <h4>Recent failures (media-sync)</h4>
            <ul className={styles.failureList}>
              {failures.length ? failures.map((f,i)=>(
                <li key={i} onClick={()=>setModalItem(f)} style={{cursor:'pointer'}}><strong>{f?.job || f?.runId || 'media-sync'}</strong> {f?.universe_id ?? f?.universe ?? ''} — <span className={styles.err}>{String(f?.error ?? f?.err ?? f?.raw ?? '')}</span><div className={styles.ts}>{String(f?.ts ?? f?.ts)}</div></li>
              )) : <li>None</li>}
            </ul>
            <div style={{marginTop:8}}><button onClick={async ()=>{ await fetch('/api/v1/admin/job-failures?job=media-sync').then(r=>r.json()).then(j=>alert('found '+(j.items||[]).length)) }}>Refresh</button> <button onClick={()=>alert('retry not yet implemented')}>Retry all</button></div>
          </div>

          <div className={styles.card}>
            <h4>Image cache</h4>
            <div>Files: (see server)</div>
            <div>Size: (see server)</div>
            <div style={{marginTop:8}}><button onClick={()=>alert('clear cache not yet implemented')}>Clear cache</button></div>
          </div>

          <div className={styles.card}>
            <h4>Live logs</h4>
            <pre className={styles.log}>{liveLogs.length ? liveLogs.join('\n') : '[no logs yet]'}</pre>
            <div style={{marginTop:8}}><button onClick={()=>{ setLiveLogs([]); }}>Clear</button></div>
          </div>
        </aside>
      </section>
      {modalItem && (
        <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setModalItem(null)}>
          <div style={{background:'#0f0f11',padding:16,borderRadius:8,maxWidth:800,width:'90%'}} onClick={e=>e.stopPropagation()}>
            <h3>Failure detail</h3>
            <pre style={{whiteSpace:'pre-wrap',color:'#eee'}}>{JSON.stringify(modalItem, null, 2)}</pre>
            <div style={{marginTop:8,textAlign:'right'}}><button onClick={()=>setModalItem(null)}>Close</button></div>
          </div>
        </div>
      )}

      {logRun && (
        <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>{ setLogRun(null); logSource?.close(); setLogSource(null); }}>
          <div style={{background:'#0f0f11',padding:16,borderRadius:8,maxWidth:'90%',width:1000, maxHeight:'90%', overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
            <h3>Run log — {logRun.name} #{logRun.runId}</h3>
            <div style={{height:420, overflow:'auto', background:'#000', padding:8, color:'#cfd4d8', fontFamily:'monospace', fontSize:12}}>
              {logContent.map((l: string, i: number)=> <div key={i}>{l}</div>)}
            </div>
            <div style={{marginTop:8,textAlign:'right'}}>
              <button onClick={()=>{ setLogRun(null); logSource?.close(); setLogSource(null); }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

