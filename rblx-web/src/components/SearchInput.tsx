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

  return (
    <div className="search-input">
      <input
        aria-label="Quick search"
        placeholder="Search universes or paste place URL"
        value={value}
        onChange={e => setValue(e.target.value)}
      />
      <button onClick={async () => {
        const v = value.trim();
        if (!v) return;
        // detect pure numeric universe id
        if (/^\d+$/.test(v)) { window.location.href = `/experience/${v}`; return; }
        // detect place URL or place id
        const match = v.match(/place(?:\.aspx)?\/(\d+)/i) || v.match(/\/places\/(\d+)/i) || v.match(/^(\d+)$/);
        if (match) { window.location.href = `/experience/${match[1]}`; return; }
        // otherwise go to search
        window.location.href = `/search?q=${encodeURIComponent(v)}`;
      }} aria-label="Search">Go</button>
    </div>
  );
}
