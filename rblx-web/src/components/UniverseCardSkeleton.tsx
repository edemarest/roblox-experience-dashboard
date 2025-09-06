export default function UniverseCardSkeleton() {
  return (
    <div style={{ padding: 12, border: '1px solid #eee', marginBottom: 8, borderRadius: 6, background: '#fafafa', display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 48, height: 48, background: '#eaeaea', borderRadius: 6 }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 12, width: '40%', background: '#eee', marginTop: 4 }} />
        <div style={{ height: 10, width: '30%', background: '#f1f1f1', marginTop: 8 }} />
      </div>
    </div>
  );
}
