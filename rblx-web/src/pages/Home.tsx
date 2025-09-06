import { useEffect, useState } from 'react';
import { getLiveNow } from '../lib/api';
import type { UniverseShort } from '../lib/api';
import UniverseCard from '../components/UniverseCard';

export default function Home() {
  const [items, setItems] = useState<UniverseShort[]>([]);
  useEffect(() => { getLiveNow(12).then(setItems).catch(()=>{}); }, []);
  return (
    <main>
      <h1>Welcome</h1>
      <section>
        <h2>Live Now</h2>
        <div className="grid">
          {items.length ? items.map((u)=> (
            <UniverseCard key={u.universe_id} universe_id={u.universe_id} name={u.name} icon_url={u.icon_url} players_now={u.players_now} favorites={u.favorites} />
          )) : <div className="empty">No data</div>}
        </div>
      </section>
    </main>
  );
}
