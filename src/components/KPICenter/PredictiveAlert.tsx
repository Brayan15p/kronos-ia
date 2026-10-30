/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, Bell, CheckCircle } from 'lucide-react';
import type { Alert } from './predictiveAlerts';

interface Props {
  alerts: Alert[];
}

const SEV_CONFIG = {
  critical: { icon: AlertTriangle, color: '#f43f5e', bg: 'rgba(244,63,94,0.08)', border: 'rgba(244,63,94,0.25)', label: 'CRÍTICO' },
  warning:  { icon: TrendingDown,  color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.25)', label: 'ALERTA' },
  info:     { icon: Bell,          color: '#818cf8', bg: 'rgba(129,140,248,0.08)',border: 'rgba(129,140,248,0.25)',label: 'INFO' },
  ok:       { icon: CheckCircle,   color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.25)', label: 'OK' },
};

const PredictiveAlert: React.FC<Props> = ({ alerts }) => {
  const critical = alerts.filter(a => a.severity === 'critical').length;
  const warning = alerts.filter(a => a.severity === 'warning').length;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-sm text-foreground">Alertas Predictivas</h3>
        </div>
        <div className="flex items-center gap-2">
          {critical > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/25">{critical} críticas</span>}
          {warning > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">{warning} alertas</span>}
        </div>
      </div>

      <div className="space-y-2">
        {alerts.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Sin alertas activas
          </div>
        )}
        {alerts.map(alert => {
          const cfg = SEV_CONFIG[alert.severity];
          const Icon = cfg.icon;
          return (
            <div
              key={alert.id}
              className="flex gap-3 p-3 rounded-xl transition-all duration-200 hover:scale-[1.01]"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cfg.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-foreground">{alert.title}</p>
                  {alert.metric && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold" style={{ background: cfg.color + '22', color: cfg.color }}>
                      {alert.metric}: {alert.value}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{alert.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PredictiveAlert;
