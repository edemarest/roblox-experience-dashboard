import type { MediaItem } from '../lib/api';

export default function MediaGallery({ items, onOpen }: { items: MediaItem[]; onOpen?: (index:number)=>void }){
  if (!items || !items.length) return <div>No media</div>;
  const placeholder = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#111"/><text x="50%" y="50%" fill="#777" font-size="20" text-anchor="middle" dominant-baseline="middle">No preview</text></svg>';
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12}}>
      {items.map((m, idx) => (
        <div key={`${m.mediaType}-${m.mediaId}`} style={{background:'#0b0b0b',padding:8,borderRadius:8,cursor:'pointer'}} onClick={()=>onOpen?.(idx)}>
          <img src={m.url ?? placeholder} alt={String(m.mediaId)} loading="lazy" style={{width:'100%',height:120,objectFit:'cover',borderRadius:6}} onError={(e)=>{(e.currentTarget as HTMLImageElement).src = placeholder}} />
          <div style={{fontSize:12,color:'#999',marginTop:6}}>{m.mediaType}</div>
        </div>
      ))}
    </div>
  );
}
