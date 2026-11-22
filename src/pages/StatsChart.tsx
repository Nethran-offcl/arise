import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import type { Stats } from '../engine/types';
import { STAT_KEYS } from '../engine/types';

/** Radar chart. Lives in its own file so Recharts is lazy-loaded (keeps the first load small). */
export default function StatsChart({ stats }: { stats: Stats }) {
  const data = STAT_KEYS.map((k) => ({ stat: k, value: stats[k] }));
  const max = Math.max(10, ...data.map((d) => d.value));
  return (
    <div className="h-64 w-full" role="img" aria-label={'Stats radar: ' + data.map((d) => `${d.stat} ${d.value}`).join(', ')}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="75%">
          <PolarGrid stroke="var(--line)" />
          <PolarAngleAxis dataKey="stat" tick={{ fill: 'var(--text)', fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, Math.ceil(max * 1.2)]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.35} isAnimationActive={false} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
