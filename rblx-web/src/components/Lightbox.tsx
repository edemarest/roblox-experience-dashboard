import type { MediaItem } from '../lib/api';
import { useEffect, useState } from 'react';

export default function Lightbox({ items, index, onClose, onPrev, onNext }: { items: MediaItem[]; index: number; onClose: ()=>void; onPrev?: ()=>void; onNext?: ()=>void }){
  useEffect(()=>{
    function onKey(e: KeyboardEvent){
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    }
    window.addEventListener('keydown', onKey);
    return ()=>window.removeEventListener('keydown', onKey);
  },[onClose,onPrev,onNext]);

  const item = items[index];
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  useEffect(()=>{
    setLoaded(false);
    setErrored(false);
  },[index]);

  // Preload adjacent images
  useEffect(()=>{
    const toPreload = [items[index-1], items[index+1]].filter(Boolean) as MediaItem[];
    const imgs: HTMLImageElement[] = [];
    for (const it of toPreload) {
      if (!it?.url) continue;
      const img = new Image();
      img.src = it.url;
      imgs.push(img);
    }
    return ()=>{
      for (const i of imgs) i.src = '';
    };
  },[index, items]);

  if (!item) return null;
  const placeholder = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="100%" height="100%" fill="#111"/><text x="50%" y="50%" fill="#777" font-size="24" text-anchor="middle" dominant-baseline="middle">No preview</text></svg>';
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}} onClick={onClose}>
      <div onClick={(e)=>e.stopPropagation()} style={{position:'relative',minWidth:200,minHeight:120}}>
        {!loaded && !errored && <div style={{width:'80vw',height:'60vh',display:'flex',alignItems:'center',justifyContent:'center',color:'#999'}}>Loading…</div>}
        <img src={errored ? placeholder : (item.url ?? placeholder)} alt={String(item.mediaId)} style={{maxWidth:'90%',maxHeight:'90%',display: loaded ? 'block' : 'none' }} onLoad={()=>setLoaded(true)} onError={(e)=>{ setErrored(true); setLoaded(true); (e.currentTarget as HTMLImageElement).src = placeholder }} />
        <button aria-label="previous" onClick={onPrev} style={{position:'absolute',left:-40,top:'50%',transform:'translateY(-50%)',background:'rgba(0,0,0,0.4)',color:'#fff',border:'none',padding:8,borderRadius:6,cursor:'pointer'}}>◀</button>
        <button aria-label="next" onClick={onNext} style={{position:'absolute',right:-40,top:'50%',transform:'translateY(-50%)',background:'rgba(0,0,0,0.4)',color:'#fff',border:'none',padding:8,borderRadius:6,cursor:'pointer'}}>▶</button>
        <button aria-label="close" onClick={onClose} style={{position:'absolute',right:8,top:8,background:'rgba(0,0,0,0.6)',color:'#fff',border:'none',padding:'6px 8px',borderRadius:6}}>✕</button>
      </div>
    </div>
  );
}
