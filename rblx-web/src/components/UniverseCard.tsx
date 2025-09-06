export type UniverseCardProps = {
  universe_id: number;
  name: string;
  icon_url?: string | null;
  players_now?: number;
  favorites?: number;
  onClick?: (id:number)=>void;
};

export default function UniverseCard({ universe_id, name, icon_url, players_now, favorites, onClick }: UniverseCardProps) {
  return (
    <article className="universe-card" onClick={() => onClick?.(universe_id)} role="button" tabIndex={0}>
      <div className="uc-top">
        <img src={icon_url ?? '/vite.svg'} alt={`${name} icon`} width={150} height={150} />
      </div>
      <div className="uc-body">
        <div className="uc-title">{name}</div>
        <div className="uc-meta">
          <span className="uc-players">▶ {players_now ?? 0}</span>
          <span className="uc-favs">★ {favorites ?? 0}</span>
        </div>
        <div className="uc-actions">
          <a href={`/experience/${universe_id}`} onClick={e=>e.stopPropagation()}>View</a>
        </div>
      </div>
    </article>
  );
}
