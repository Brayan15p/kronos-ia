import React from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, Bell, CheckCircle } from 'lucide-react';

interface Alert {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info' | 'ok';
  metric?: string;
  value?: string;
}

interface Props {
  alerts: Alert[];
}

const SEV_CONFIG = {
  critical: { icon: AlertTriangle, color: '#f43f5e', bg: 'rgba(244,63,94,0.08)', border: 'rgba(244,63,94,0.25)', label: 'CRÍTICO' },
  warning:  { icon: TrendingDown,  color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.25)', label: 'ALERTA' },
  info:     { icon: Bell,          color: '#818cf8', bg: 'rgba(129,140,248,0.08)',border: 'rgba(129,140,248,0.25)',label: 'INFO' },
  ok:       { icon: CheckCircle,   color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.25)', label: 'OK' },
};

export function buildAlerts(data: {
  oee: number;
  rulaAvg: number;
  efficiencyPct: number;
  emotionScore: number;
  dailyLoss: number;
  daysWithoutAccident: number;
}): Alert[] {
  const alerts: Alert[] = [];
  const { oee, rulaAvg, efficiencyPct, emotionScore, dailyLoss, daysWithoutAccident } = data;

  if (oee < 65) alerts.push({ id: 'oee-crit', severity: 'critical', title: 'OEE crítico', description: 'La eficiencia global del equipo está por debajo del 65%. Se requiere intervención inmediata.', metric: 'OEE', value: `${oee}%` });
  else if (oee < 85) alerts.push({ id: 'oee-warn', severity: 'warning', title: 'OEE mejorable', description: `OEE actual (${oee}%) por debajo de clase mundial (85%). Investigar pérdidas principales.`, metric: 'OEE', value: `${oee}%` });
  else alerts.push({ id: 'oee-ok', severity: 'ok', title: 'OEE óptimo', description: `OEE de ${oee}% — rendimiento de clase mundial mantenido.`, metric: 'OEE', value: `${oee}%` });

  if (rulaAvg >= 5) alerts.push({ id: 'rula-crit', severity: 'critical', title: 'Riesgo ergonómico alto', description: 'El score RULA promedio indica necesidad de cambio inmediato en el puesto de trabajo.', metric: 'RULA', value: rulaAvg.toFixed(1) });
  else if (rulaAvg >= 3) alerts.push({ id: 'rula-warn', severity: 'warning', title: 'Ergonomía a revisar', description: 'Score RULA indica que se debe investigar y considerar mejoras en el puesto.', metric: 'RULA', value: rulaAvg.toFixed(1) });

  if (efficiencyPct < 50) alerts.push({ id: 'eff-crit', severity: 'critical', title: 'Eficiencia Therblig crítica', description: 'Más del 50% de los movimientos son ineficientes. Rediseñar el método de trabajo.', metric: 'Therbligs', value: `${efficiencyPct}%` });
  else if (efficiencyPct < 70) alerts.push({ id: 'eff-warn', severity: 'warning', title: 'Eficiencia mejorable', description: 'Hay oportunidad de reducir movimientos ineficientes y mejorar el ciclo.', metric: 'Therbligs', value: `${efficiencyPct}%` });

  if (emotionScore < 35) alerts.push({ id: 'emo-crit', severity: 'critical', title: 'Bienestar crítico', description: 'El operario muestra signos de fatiga o estrés elevado. Considerar descanso.', metric: 'Bienestar', value: `${emotionScore}%` });
  else if (emotionScore < 55) alerts.push({ id: 'emo-warn', severity: 'warning', title: 'Bienestar bajo', description: 'Nivel de bienestar por debajo del óptimo. Monitorear tendencia.', metric: 'Bienestar', value: `${emotionScore}%` });

  if (dailyLoss > 500000) alerts.push({ id: 'loss-warn', severity: 'warning', title: 'Pérdida diaria elevada', description: `Se estima una pérdida de $${dailyLoss.toLocaleString('es-CO')} COP en el día. Revisar causas raíz.`, metric: 'Pérdida', value: `$${(dailyLoss / 1000).toFixed(0)}K` });

  if (daysWithoutAccident >= 100) alerts.push({ id: 'acc-ok', severity: 'ok', title: `${daysWithoutAccident} días sin accidente`, description: 'Excelente historial de seguridad. Mantener las buenas prácticas.', metric: 'Seguridad', value: `${daysWithoutAccident}d` });

  return alerts.slice(0, 8);
}

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
