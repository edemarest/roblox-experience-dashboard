import type { UniverseShort } from '../lib/api';
import { Link } from 'react-router-dom';

export default function UniverseRow({ universe }: { universe: UniverseShort }){
  return (
    <div className="universe-row">
      <img src={universe.icon_url ?? '/vite.svg'} alt="icon" width={64} height={64} />
      <div style={{flex:1, marginLeft:12}}>
        <div style={{fontWeight:600}}>{universe.name}</div>
        <div style={{color:'#666',fontSize:13}}>Players {universe.players_now ?? 0} • Fav {universe.favorites ?? 0}</div>
      </div>
      <div><Link to={`/experience/${universe.universe_id}`}>View</Link></div>
    </div>
  );
}
