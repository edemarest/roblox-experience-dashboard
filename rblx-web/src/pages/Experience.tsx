import { useParams } from 'react-router-dom';
import useExperience from '../hooks/useExperience';
import UniverseCardSkeleton from '../components/UniverseCardSkeleton';
import useExperienceHistory from '../hooks/useExperienceHistory';
import useExperienceBadges from '../hooks/useExperienceBadges';
import useExperienceMedia from '../hooks/useExperienceMedia';
import useExperienceIcons from '../hooks/useExperienceIcons';
import useTrackUniverse from '../hooks/useTrackUniverse';
import ActivityChart from '../components/ActivityChart';
import BadgesList from '../components/BadgesList';
import MediaGallery from '../components/MediaGallery';
import Lightbox from '../components/Lightbox';
import MediaSkeleton from '../components/MediaSkeleton';
import { useState, useEffect } from 'react';
import '../styles/global.css';

export default function ExperiencePage() {
  const { id } = useParams();
  const idNum = id ? Number(id) : undefined;
  const q = useExperience(idNum);
  const historyQ = useExperienceHistory(idNum);
  const badgesQ = useExperienceBadges(idNum);
  const mediaQ = useExperienceMedia(idNum);
  const iconsQ = useExperienceIcons(idNum);
  const [hasVisibleMedia, setHasVisibleMedia] = useState<boolean | null>(null);
  const fallbackIcon = (() => {
    if (q.data?.icon_url) return q.data.icon_url;
    if (iconsQ.isSuccess && (iconsQ.data ?? []).length) {
      // prefer the largest available size
      const items = (iconsQ.data ?? []).filter(Boolean) as Array<{ size?: number; url?: string }>;
      items.sort((a,b)=> (Number(b.size||0) - Number(a.size||0)));
      return items[0]?.url ?? null;
    }
    return null;
  })();

  // Detect whether any media URLs are actually reachable by the browser. Some CDN fallbacks
  // (for example the direct t0.rbxcdn.com/<id> pattern) can return 403 when requested
  // from the browser, so we try to preload a few items and mark media as unavailable
  // if none load. This avoids showing an empty/404-filled Media tab.
  useEffect(()=>{
    if (!mediaQ.isSuccess) { setHasVisibleMedia(null); return; }
    const items = (mediaQ.data ?? []) as any[];
    if (!items.length) { setHasVisibleMedia(false); return; }
    let mounted = true;
    let resolved = false;
    const toCheck = items.slice(0, 3).map((i: any) => String(i.url)).filter(u => Boolean(u)) as string[];
    if (!toCheck.length) { setHasVisibleMedia(false); return; }
    const imgs: HTMLImageElement[] = [];
    let timeout: ReturnType<typeof setTimeout>;
    function cleanup(){
      if (timeout) clearTimeout(timeout);
      for (const im of imgs) im.src = '';
    }
    for (const u of toCheck) {
      const img = new Image();
      imgs.push(img);
      img.onload = ()=>{
        if (!mounted) return; if (resolved) return; resolved = true; cleanup(); setHasVisibleMedia(true);
      };
      img.onerror = ()=>{
        // ignore; final result determined by timeout
      };
      try { img.src = u; } catch (e) { /* ignore */ }
    }
    timeout = setTimeout(()=>{
      if (!mounted) return; if (resolved) return; resolved = true; cleanup(); setHasVisibleMedia(false);
    }, 1500);
    return ()=>{ mounted = false; cleanup(); };
  },[mediaQ.isSuccess, mediaQ.data]);
  const tracker = useTrackUniverse();
  const [tab, setTab] = useState<'overview'|'activity'|'badges'|'media'|'updates'|'related'>('overview');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <main className="page">
      {q.isLoading ? (
        <div>
          <UniverseCardSkeleton />
          <div style={{ marginTop: 12 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <UniverseCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : q.data ? (
        <div className="experience">
          <header className="exp-header">
            <div className="exp-title-row">
              <img src={fallbackIcon ?? q.data.icon_url ?? '/vite.svg'} alt="icon" className="exp-icon" />
              <div>
                <h1 className="exp-title">{q.data.name}</h1>
                <div className="exp-meta">Players: {q.data.players_now ?? '—'} • Favorites: {q.data.favorites ?? '—'}</div>
              </div>
            </div>
              <div className="exp-actions">
              <button onClick={() => setTab('overview')}>Overview</button>
              <button onClick={() => setTab('activity')}>Activity</button>
              <button onClick={() => setTab('badges')}>Badges</button>
              {hasVisibleMedia === true && <button onClick={() => setTab('media')}>Media</button>}
              <button onClick={() => setTab('updates')}>Updates</button>
              <button onClick={() => setTab('related')}>Related</button>
            </div>
          </header>

          <div className="exp-body">
            <aside className="exp-left">
              <section className="exp-section">
                <h3>Overview</h3>
                <div><strong>Description:</strong> {q.data.description ?? '—'}</div>
                <div style={{marginTop:8}}><strong>Universe ID:</strong> {q.data.universe_id}</div>
                <div style={{marginTop:8}}><strong>Created:</strong> {q.data.created_at ?? '—'}</div>
                <div style={{marginTop:4}}><strong>Updated:</strong> {q.data.updated_at ?? '—'}</div>
              </section>

              <section className="exp-section">
                <h3>Quick Actions</h3>
                <div>
                  <button
                    className="btn"
                    onClick={() => tracker.mutate(String(q.data?.universe_id ?? idNum))}
                    disabled={tracker.isLoading || q.data?.header?.isTracked}
                  >
                    {q.data?.header?.isTracked ? 'Tracked' : tracker.isLoading ? 'Tracking…' : 'Track'}
                  </button>
                  <button style={{marginLeft:8}} onClick={() => window.open(`https://www.roblox.com/games/${q.data?.universe_id ?? idNum}`, '_blank')}>Open in Roblox</button>
                </div>
                {tracker.isError && <div style={{color:'#f88',marginTop:8}}>Failed to resolve/track.</div>}
              </section>
            </aside>

            <section className="exp-main">
              {tab === 'activity' && (
                <div className="exp-section">
                  <h3>Activity (last 24h)</h3>
                  {historyQ.isLoading ? (
                    <div>Loading activity...</div>
                  ) : historyQ.isError ? (
                    <div style={{color:'#f88'}}>Failed to load activity</div>
                  ) : (
                    <ActivityChart series={historyQ.data ?? []} />
                  )}
                </div>
              )}

              {tab === 'badges' && (
                <div className="exp-section">
                  <h3>Badges</h3>
                  {badgesQ.isLoading ? (
                    <div>Loading badges...</div>
                  ) : badgesQ.isError ? (
                    <div style={{color:'#f88'}}>Failed to load badges</div>
                  ) : (
                    <>
                      <BadgesList items={badgesQ.data?.pages?.flatMap((p: any) => p.items) ?? []} />
                      {badgesQ.hasNextPage && <button onClick={() => badgesQ.fetchNextPage?.()}>Load more badges</button>}
                    </>
                  )}
                </div>
              )}

              {tab === 'media' && (
                <div className="exp-section">
                  <h3>Media</h3>
                  {mediaQ.isLoading ? (
                    <>
                      {/* show small skeleton cards while media loads */}
                      <MediaSkeleton />
                    </>
                  ) : mediaQ.isError ? (
                    <div style={{color:'#f88'}}>Failed to load media</div>
                  ) : (
                    <>
                      <MediaGallery items={mediaQ.data ?? []} onOpen={(i) => setLightboxIndex(i)} />
                      {lightboxIndex !== null && mediaQ.data && (
                        <Lightbox
                          items={mediaQ.data}
                          index={lightboxIndex}
                          onClose={() => setLightboxIndex(null)}
                          onPrev={() => setLightboxIndex((v)=> (v==null?null: Math.max(0, v-1)))}
                          onNext={() => setLightboxIndex((v)=> (v==null?null: Math.min((mediaQ.data?.length ?? 1)-1, v+1)))}
                        />
                      )}
                    </>
                  )}
                </div>
              )}

              {tab === 'overview' && (
                <div className="exp-section">
                  <h3>Summary</h3>
                  <div style={{display:'flex',gap:12}}>
                    <div><strong>Players:</strong> {q.data.snapshot?.playing ?? q.data.players_now ?? '—'}</div>
                    <div><strong>Visits:</strong> {q.data.snapshot?.visitsTotal ?? '—'}</div>
                    <div><strong>Favorites:</strong> {q.data.snapshot?.favoritesTotal ?? q.data.favorites ?? '—'}</div>
                    <div><strong>Like ratio:</strong> {q.data.snapshot?.likeRatio != null ? (q.data.snapshot.likeRatio*100).toFixed(1)+'%' : '—'}</div>
                    <div><strong>Wilson score:</strong> {q.data.snapshot?.wilsonScore?.toFixed(3) ?? '—'}</div>
                    <div><strong>Est. servers:</strong> {q.data.derived?.estimatedServers ?? '—'}</div>
                  </div>
                </div>
              )}

              {tab === 'updates' && <div className="exp-section"><h3>Updates</h3><div>Updates placeholder</div></div>}
              {tab === 'related' && <div className="exp-section"><h3>Related</h3><div>Related experiences placeholder</div></div>}
            </section>
          </div>
        </div>
      ) : (
        <div>Not found</div>
      )}
    </main>
  );
}
