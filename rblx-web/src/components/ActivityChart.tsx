import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function ActivityChart({ series }: { series: Array<[string|number, number|null]> }){
  const data = (series || []).map(([ts, v]) => ({ ts, v: v ?? 0 }));
  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={data as any}>
          <XAxis dataKey="ts" hide />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="v" stroke="#8884d8" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
