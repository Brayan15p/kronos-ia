import React from 'react';
import { Globe, Award } from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  myOEE: number;
  myRula: number;
  myEfficiency: number;
  myWellbeing: number;
  myQuality: number;
}

const INDUSTRY_BENCHMARKS = {
  manufacturing: { oee: 74, rula: 3.8, efficiency: 64, wellbeing: 58, quality: 97 },
  automotive:    { oee: 82, rula: 3.2, efficiency: 72, wellbeing: 62, quality: 98 },
  electronics:   { oee: 78, rula: 2.9, efficiency: 69, wellbeing: 65, quality: 99 },
  worldClass:    { oee: 85, rula: 2.0, efficiency: 85, wellbeing: 80, quality: 99.5 },
};

const BenchmarkPanel: React.FC<Props> = ({ myOEE, myRula, myEfficiency, myWellbeing, myQuality }) => {
  const [sector, setSector] = React.useState<keyof typeof INDUSTRY_BENCHMARKS>('manufacturing');
  const bench = INDUSTRY_BENCHMARKS[sector];

  const rulaScore = Math.round(Math.max(0, (7 - myRula) / 6 * 100));
  const benchRulaScore = Math.round(Math.max(0, (7 - bench.rula) / 6 * 100));

  const radarData = [
    { metric: 'OEE',        yo: myOEE,       sector: bench.oee,        wc: INDUSTRY_BENCHMARKS.worldClass.oee },
    { metric: 'Ergonomía',  yo: rulaScore,    sector: benchRulaScore,   wc: Math.round((7 - INDUSTRY_BENCHMARKS.worldClass.rula) / 6 * 100) },
    { metric: 'Eficiencia', yo: myEfficiency, sector: bench.efficiency, wc: INDUSTRY_BENCHMARKS.worldClass.efficiency },
    { metric: 'Bienestar',  yo: myWellbeing,  sector: bench.wellbeing,  wc: INDUSTRY_BENCHMARKS.worldClass.wellbeing },
    { metric: 'Calidad',    yo: myQuality,    sector: bench.quality,    wc: INDUSTRY_BENCHMARKS.worldClass.quality },
  ];

  const overallPercentile = Math.round(
    [myOEE / bench.oee, myEfficiency / bench.efficiency, myWellbeing / bench.wellbeing].reduce((a, b) => a + b) / 3 * 50
  );

  const sectorLabels: Record<string, string> = {
    manufacturing: 'Manufactura general',
    automotive:    'Industria automotriz',
    electronics:   'Electrónica',
    worldClass:    'Clase mundial',
  };

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-sm text-foreground">Benchmark por Industria</h3>
        </div>
        <select
          value={sector}
          onChange={e => setSector(e.target.value as keyof typeof INDUSTRY_BENCHMARKS)}
          className="select-glass text-xs py-1"
        >
          {Object.entries(sectorLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Percentile badge */}
      <div
        className="p-3 rounded-xl text-center"
        style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)' }}
      >
        <div className="flex items-center justify-center gap-2">
          <Award className="w-4 h-4 text-accent" />
          <p className="text-sm font-bold text-foreground">
            Percentil <span className="text-accent font-mono text-lg">{Math.min(99, overallPercentile)}</span> del sector
          </p>
        </div>
        <p className="text-xs text-muted-foreground mt-1">vs {sectorLabels[sector]}</p>
      </div>

      {/* Radar */}
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={radarData}>
          <PolarGrid stroke="rgba(255,255,255,0.06)" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748b', fontSize: 10 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 8 }} />
          <Radar name="Tú" dataKey="yo" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.2} strokeWidth={2} />
          <Radar name={sectorLabels[sector]} dataKey="sector" stroke="#818cf8" fill="#818cf8" fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 2" />
          <Radar name="Clase mundial" dataKey="wc" stroke="#fbbf24" fill="none" strokeWidth={1} strokeDasharray="2 2" />
          <Tooltip contentStyle={{ background: 'hsl(230,22%,9%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </RadarChart>
      </ResponsiveContainer>

      {/* Comparison table */}
      <div className="space-y-1.5 border-t border-white/[0.06] pt-3">
        {[
          { label: 'OEE',       mine: myOEE,       ref: bench.oee,        unit: '%', higher: true },
          { label: 'Eficiencia',mine: myEfficiency, ref: bench.efficiency, unit: '%', higher: true },
          { label: 'Bienestar', mine: myWellbeing,  ref: bench.wellbeing,  unit: '%', higher: true },
        ].map(({ label, mine, ref, unit, higher }) => {
          const diff = Math.round(mine - ref);
          const isGood = higher ? diff >= 0 : diff <= 0;
          return (
            <div key={label} className="flex items-center gap-3">
              <span className="w-20 text-xs text-muted-foreground">{label}</span>
              <div className="flex-1 flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-foreground w-10">{mine}{unit}</span>
                <span className="text-xs text-muted-foreground">vs {ref}{unit}</span>
              </div>
              <span className="text-xs font-mono font-bold" style={{ color: isGood ? '#34d399' : '#f43f5e' }}>
                {diff >= 0 ? '+' : ''}{diff}{unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BenchmarkPanel;
