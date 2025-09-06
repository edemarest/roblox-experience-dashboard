export default function MediaSkeleton(){
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12}}>
      {Array.from({length:6}).map((_,i)=> (
        <div key={i} style={{background:'#0b0b0b',padding:8,borderRadius:8}}>
          <div style={{width:'100%',height:120,background:'#111',borderRadius:6}} />
          <div style={{height:12,background:'#121212',marginTop:8,borderRadius:4,width:'40%'}} />
        </div>
      ))}
    </div>
  );
}
