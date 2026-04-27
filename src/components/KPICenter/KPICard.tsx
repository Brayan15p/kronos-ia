import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  color?: string;
  icon?: React.ReactNode;
  sublabel?: string;
  size?: 'sm' | 'md' | 'lg';
}

const KPICard: React.FC<Props> = ({
  label, value, unit, delta, deltaLabel, color = '#22d3ee', icon, sublabel, size = 'md',
}) => {
  const valueSize = size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-3xl' : 'text-xl';
  const hasPositiveDelta = delta !== undefined && delta > 0;
  const hasNegativeDelta = delta !== undefined && delta < 0;
  const deltaColor = hasPositiveDelta ? '#34d399' : hasNegativeDelta ? '#f43f5e' : '#94a3b8';

  return (
    <div
      className="glass-card p-4 hover:scale-[1.02] transition-all duration-300 cursor-default relative overflow-hidden"
      style={{ borderColor: color + '1a' }}
    >
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${color}, transparent 70%)` }}
      />
      <div className="relative space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">{label}</p>
          {icon && (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color + '18' }}>
              <span style={{ color }}>{icon}</span>
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className={`font-mono font-bold ${valueSize} leading-none`} style={{ color }}>
            {value}
          </span>
          {unit && <span className="text-sm text-muted-foreground font-mono">{unit}</span>}
        </div>

        {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}

        {delta !== undefined && (
          <div className="flex items-center gap-1.5">
            {hasPositiveDelta ? (
              <TrendingUp className="w-3 h-3" style={{ color: deltaColor }} />
            ) : hasNegativeDelta ? (
              <TrendingDown className="w-3 h-3" style={{ color: deltaColor }} />
            ) : (
              <Minus className="w-3 h-3" style={{ color: deltaColor }} />
            )}
            <span className="text-xs font-semibold" style={{ color: deltaColor }}>
              {delta > 0 ? '+' : ''}{delta}{deltaLabel || '%'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default KPICard;
