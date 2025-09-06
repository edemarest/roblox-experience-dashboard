import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { getUniverseFetchProgress } from '../lib/api';
import { useToast } from './ToastProvider';

type ProgressResp = { ok?: boolean; progress?: { runId?: string | null; status?: string | null; startedAt?: string | null; finishedAt?: string | null } | null };

export default function FetchProgressModal({ universeId, onClose }: { universeId: number; onClose?: () => void }) {
  const toast = useToast();
  const queuedSinceRef = useRef<number | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  const q = useQuery({
    queryKey: ['fetchProgress', universeId],
    queryFn: () => getUniverseFetchProgress(universeId),
    enabled: !!universeId,
    // Polling interval with simple backoff for long-queued jobs.
    // We avoid logging here to prevent noisy console output; logs occur when status changes.
    refetchInterval: (maybe: any) => {
      // extract data if possible
      let status: string | null = null;
      try {
        const dataObj = maybe && maybe.state && maybe.state.data ? maybe.state.data : maybe;
        status = String(dataObj?.progress?.status ?? '').toLowerCase() || null;
      } catch (e) { status = null; }

      if (!status) return 2000;
      if (status === 'finished' || status === 'idle' || status === 'failed') return false;

      // if job is queued/running, apply mild backoff if it stays queued for long
      if (status === 'queued') {
        if (!queuedSinceRef.current) queuedSinceRef.current = Date.now();
        const elapsed = Date.now() - (queuedSinceRef.current || 0);
        if (elapsed > 5 * 60_000) return 15_000; // after 5m poll every 15s
        if (elapsed > 2 * 60_000) return 5_000;  // after 2m poll every 5s
        return 2000;
      }

      // running/started
      queuedSinceRef.current = null;
      return 1000;
    }
  });

  // Only log when status changes to avoid spamming the console repeatedly.
  useEffect(() => {
    const status = String(q.data?.progress?.status ?? '').toLowerCase();
    if (lastStatusRef.current !== status) {
      lastStatusRef.current = status;
      try { console.log('[FetchProgressModal] progress data changed', q.data); } catch (e) {}
    }
  }, [q.data]);

  const qc = useQueryClient();
  // Auto-close and refresh experience data when fetch finishes
  useEffect(() => {
  const status = String(q.data?.progress?.status ?? '').toLowerCase();
    if (status === 'finished' || status === 'idle') {
      try {
        console.log('[FetchProgressModal] detected finished status, invalidating experience and closing modal', status);
        qc.invalidateQueries(['experience', universeId]);
      } catch (e) { console.error('[FetchProgressModal] invalidate failed', e); }
  // show success toast and close
  try { toast.push({ message: 'Experience fetch completed', type: 'success' }); } catch (e) {}
  if (onClose) onClose();
    }
    if (status === 'failed') {
      console.error('[FetchProgressModal] fetch job failed for', universeId);
  try { toast.push({ message: 'Experience fetch failed', type: 'error' }); } catch (e) {}
  if (onClose) onClose();
    }
    // If job has been queued for very long, inform the user and allow them to stop polling.
    if (status === 'queued') {
      const queuedFor = queuedSinceRef.current ? (Date.now() - queuedSinceRef.current) : 0;
      // if queuedSince wasn't set yet, set it now
      if (!queuedSinceRef.current) queuedSinceRef.current = Date.now();
      if (queuedFor > 10 * 60_000) {
        try { toast.push({ message: 'Fetch still queued after 10 minutes — polling will continue in background. Close to dismiss.', type: 'info' }); } catch (e) {}
      }
    }
  }, [q.data?.progress?.status]);

  const status = q.data?.progress?.status ?? 'queued';
  const startedAt = q.data?.progress?.startedAt ?? null;
  const finishedAt = q.data?.progress?.finishedAt ?? null;

  const isActive = ['queued', 'running', 'started'].includes(String(status).toLowerCase());

  // small spinner element
  const Spinner = () => (
    <div style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 9, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'white', animation: 'spin 1s linear infinite' }} />
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
  <div style={{ background: '#fff', padding: 20, borderRadius: 8, width: 420, maxWidth: '90%', color: '#111' }}>
        <h3>Fetching experience details</h3>
        <div style={{ marginTop: 8 }}>
          <div>Status: <strong>{String(status)}</strong></div>
          {isActive && <div style={{ marginTop: 8 }}><Spinner /></div>}
          {startedAt && <div>Started at: {String(startedAt)}</div>}
          {finishedAt && <div>Finished at: {String(finishedAt)}</div>}
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {isActive ? (
            <button onClick={() => { try { toast.push({ message: 'Stopped polling; fetch will continue server-side.', type: 'info' }); } catch(e){}; if (onClose) onClose(); }}>Stop polling</button>
          ) : (
            <button onClick={() => onClose && onClose()}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
