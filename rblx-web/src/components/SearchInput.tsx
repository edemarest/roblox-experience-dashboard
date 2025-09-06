import { useState, useEffect } from 'react';

export type SearchInputProps = {
  onQuery?: (q: string) => void;
};

export default function SearchInput({ onQuery }: SearchInputProps) {
  const [value, setValue] = useState('');
  useEffect(() => {
  const t = setTimeout(() => { if (onQuery) onQuery(value); }, 300);
    return () => clearTimeout(t);
  }, [value, onQuery]);
  function handleSubmit() {
    try {
      console.log('[SearchInput] submit clicked, value=', value);
      const v = value.trim();
      if (!v) { console.log('[SearchInput] empty value, ignoring'); return; }

      // detect pure numeric universe id
      if (/^\d+$/.test(v)) {
        console.log('[SearchInput] numeric id detected:', v);
        try { sessionStorage.setItem('kick_fetch', String(v)); console.log('[SearchInput] session kick_fetch set to', v); } catch (e) { console.error('[SearchInput] failed to set sessionStorage', e); }
        window.location.href = `/experience/${v}`;
        return;
      }

      // detect place URL or place id
      const match = v.match(/place(?:\.aspx)?\/(\d+)/i) || v.match(/\/places\/(\d+)/i) || v.match(/^(\d+)$/);
      if (match) {
        const id = match[1];
        console.log('[SearchInput] place/id detected:', id);
        try { sessionStorage.setItem('kick_fetch', String(id)); console.log('[SearchInput] session kick_fetch set to', id); } catch (e) { console.error('[SearchInput] failed to set sessionStorage', e); }
        window.location.href = `/experience/${id}`;
        return;
      }

      // otherwise go to search
      console.log('[SearchInput] performing search redirect for query=', v);
      window.location.href = `/search?q=${encodeURIComponent(v)}`;
    } catch (e) {
      console.error('[SearchInput] submit error', e);
    }
  }

  return (
    <div className="search-input">
      <input
        aria-label="Quick search"
        placeholder="Search universes or paste place URL"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); console.log('[SearchInput] Enter pressed'); handleSubmit(); } }}
      />
      <button onClick={() => handleSubmit()} aria-label="Search">Go</button>
    </div>
  );
}
