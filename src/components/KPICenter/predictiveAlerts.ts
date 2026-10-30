/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Reglas de las alertas predictivas del KPI Center (separadas del componente para el fast refresh).

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info' | 'ok';
  metric?: string;
  value?: string;
}

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
