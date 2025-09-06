import type { Badge } from '../lib/api';
import styles from './BadgesList.module.css';
import { FaMedal } from 'react-icons/fa';
import { useState } from 'react';

export default function BadgesList({ items }: { items: Badge[] }){
  if (!items || !items.length) return <div>No badges</div>;
  return (
    <div className={styles.grid}>
      {items.map((b: Badge) => (
        <div key={b.badgeId} title={b.description || ''} className={styles.card}>
          <div className={styles.icon}>
            <BadgeImage src={b.iconUrl} name={b.name} />
          </div>
          <div className={styles.textWrap}>
            <div className={styles.title}>{b.name}</div>
            <div className={styles.desc}>{b.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BadgeImage({ src, name }: { src?: string | null; name?: string }){
  const [errored, setErrored] = useState(false);
  if (!src || errored) return <FaMedal style={{ color: '#777' }} aria-label={name ?? 'badge'} />;
  // Use browser to load; on error, fallback to placeholder
  return <img src={src} alt={name} className={styles.img} onError={() => setErrored(true)} />;
}
