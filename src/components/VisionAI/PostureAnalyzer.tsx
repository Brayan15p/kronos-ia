import React from 'react';
import { PostureScore, HeadPose, EyeState } from './types';
import { Activity, Eye, AlertTriangle } from 'lucide-react';

interface Props {
  posture: PostureScore | null;
  head: HeadPose | null;
  eyes: EyeState | null;
}

const RULA_CONFIG: Record<number, { label: string; color: string; action: string }> = {
  1: { label: 'Óptimo',         color: '#22d3ee', action: 'Sin acción requerida' },
  2: { label: 'Aceptable',      color: '#34d399', action: 'Sin acción requerida' },
  3: { label: 'Investigar',     color: '#a3e635', action: 'Investigar pronto' },
  4: { label: 'Investigar',     color: '#fbbf24', action: 'Investigar y cambiar' },
  5: { label: 'Cambiar',        color: '#fb923c', action: 'Cambiar pronto' },
  6: { label: 'Cambiar pronto', color: '#f97316', action: 'Cambiar pronto' },
  7: { label: 'Cambiar ya',     color: '#f43f5e', action: 'Acción inmediata' },
};

function AngleBar({ label, value, max, warn }: { label: string; value: number; max: number; warn: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value > warn ? '#f43f5e' : value > warn * 0.6 ? '#fbbf24' : '#22d3ee';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold" style={{ color }}>{value}°</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-400" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const PostureAnalyzer: React.FC<Props> = ({ posture, head, eyes }) => {
  const rulaConfig = posture ? RULA_CONFIG[posture.rula] || RULA_CONFIG[7] : null;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-accent" />
        <h3 className="font-display font-bold text-sm text-foreground">Ergonomía en Tiempo Real</h3>
      </div>

      {/* RULA Score */}
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle
              cx="32" cy="32" r="26"
              fill="none"
              stroke={rulaConfig?.color || '#22d3ee'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${((posture?.rula || 1) / 7) * 163.4} 163.4`}
              transform="rotate(-90 32 32)"
              style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease', filter: `drop-shadow(0 0 6px ${rulaConfig?.color || '#22d3ee'}66)` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold font-mono" style={{ color: rulaConfig?.color || '#22d3ee' }}>
              {posture?.rula || '—'}
            </span>
          </div>
        </div>
        <div>
          <p className="font-display font-bold text-sm" style={{ color: rulaConfig?.color || '#94a3b8' }}>
            RULA {rulaConfig?.label || '—'}
          </p>
          <p className="text-xs text-muted-foreground">{rulaConfig?.action || 'Sin detección'}</p>
        </div>
      </div>

      {/* Angle bars */}
      {posture && (
        <div className="space-y-2.5">
          <AngleBar label="Cuello" value={posture.neckAngle} max={60} warn={20} />
          <AngleBar label="Tronco" value={posture.trunkAngle} max={80} warn={20} />
          <AngleBar label="Brazo superior" value={posture.upperArmAngle} max={90} warn={45} />
          <AngleBar label="Muñeca" value={posture.wristAngle} max={30} warn={15} />
        </div>
      )}

      {/* Head pose */}
      {head && (
        <div className="border-t border-white/[0.06] pt-3 space-y-1.5">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Posición de cabeza</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Yaw', value: head.yaw, limit: 30 },
              { label: 'Pitch', value: head.pitch, limit: 25 },
              { label: 'Roll', value: head.roll, limit: 15 },
            ].map(({ label, value, limit }) => (
              <div key={label} className="text-center p-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-mono font-bold" style={{ color: Math.abs(value) > limit ? '#f43f5e' : '#22d3ee' }}>
                  {value > 0 ? '+' : ''}{value}°
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Eye state */}
      {eyes && (
        <div className="border-t border-white/[0.06] pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {eyes.isDrowsy
                ? <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                : <Eye className="w-3.5 h-3.5 text-green-400" />
              }
              <p className="text-xs font-semibold" style={{ color: eyes.isDrowsy ? '#fbbf24' : '#34d399' }}>
                {eyes.isClosed ? 'Ojos cerrados' : eyes.isDrowsy ? 'Somnolencia detectada' : 'Ojos abiertos'}
              </p>
            </div>
            <span className="text-xs font-mono text-muted-foreground">EAR {eyes.avgEAR.toFixed(2)}</span>
          </div>
          <div className="mt-2 flex gap-2">
            {[
              { label: 'Izquierdo', val: eyes.leftEAR },
              { label: 'Derecho', val: eyes.rightEAR },
            ].map(({ label, val }) => (
              <div key={label} className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, val * 250)}%`, background: val < 0.21 ? '#f43f5e' : '#22d3ee' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PostureAnalyzer;
