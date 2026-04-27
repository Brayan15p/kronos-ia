import React, { useState } from 'react';
import { BarChart3, Info } from 'lucide-react';
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  onOEEChange?: (oee: number) => void;
}

const OEECalculator: React.FC<Props> = ({ onOEEChange }) => {
  const [availability, setAvailability] = useState(90);
  const [performance, setPerformance] = useState(85);
  const [quality, setQuality] = useState(95);

  const oee = Math.round(availability * performance * quality / 10000);

  React.useEffect(() => { onOEEChange?.(oee); }, [oee, onOEEChange]);

  const oeeColor = oee >= 85 ? '#34d399' : oee >= 65 ? '#fbbf24' : '#f43f5e';

  const chartData = [
    { name: 'OEE', value: oee, fill: oeeColor },
    { name: 'Calidad', value: quality, fill: '#818cf8' },
    { name: 'Rendim.', value: performance, fill: '#22d3ee' },
    { name: 'Dispon.', value: availability, fill: '#34d399' },
  ];

  function Slider({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono font-bold" style={{ color }}>{value}%</span>
        </div>
        <input
          type="range" min={0} max={100} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{ accentColor: color }}
        />
      </div>
    );
  }

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-sm text-foreground">Calculadora OEE</h3>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Overall Equipment Effectiveness">
          <Info className="w-3 h-3" />
          <span>World class: ≥85%</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative" style={{ width: 100, height: 100 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart innerRadius={30} outerRadius={46} data={chartData} startAngle={90} endAngle={-270}>
              <RadialBar dataKey="value" cornerRadius={4} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-mono font-bold" style={{ color: oeeColor }}>{oee}</span>
            <span className="text-[10px] text-muted-foreground">OEE %</span>
          </div>
        </div>
        <div className="flex-1 space-y-1">
          {[
            { label: 'Disponibilidad', value: availability, color: '#34d399' },
            { label: 'Rendimiento', value: performance, color: '#22d3ee' },
            { label: 'Calidad', value: quality, color: '#818cf8' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-xs text-muted-foreground w-24">{label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
              </div>
              <span className="text-xs font-mono" style={{ color }}>{value}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-white/[0.06] pt-3">
        <Slider label="Disponibilidad" value={availability} onChange={setAvailability} color="#34d399" />
        <Slider label="Rendimiento" value={performance} onChange={setPerformance} color="#22d3ee" />
        <Slider label="Calidad" value={quality} onChange={setQuality} color="#818cf8" />
      </div>

      <div
        className="p-2.5 rounded-lg text-xs text-center"
        style={{ background: oeeColor + '12', border: `1px solid ${oeeColor}33` }}
      >
        <p className="font-semibold" style={{ color: oeeColor }}>
          {oee >= 85 ? '🏆 Clase mundial — mantener el estándar' :
           oee >= 65 ? '⚠️ Mejorable — identificar pérdidas principales' :
           '🔴 Crítico — intervención inmediata requerida'}
        </p>
      </div>
    </div>
  );
};

export default OEECalculator;
