import React, { useState, useMemo } from 'react';
import { BarChart3, FileDown, FileSpreadsheet, Trophy, TrendingUp, Users, Shield, DollarSign, Activity } from 'lucide-react';
import { useTimeStudy } from '@/context/TimeStudyContext';
import { useSST, getLuxCompliance, getDbCompliance, calculateLEQ } from '@/context/SSTContext';
import KPICard from './KPICard';
import OEECalculator from './OEECalculator';
import PredictiveAlert from './PredictiveAlert';
import BenchmarkPanel from './BenchmarkPanel';
import CertificationExport from './CertificationExport';
import { buildAlerts } from './PredictiveAlert';
import { downloadCSV } from '../VisionAI/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const TOOLTIP_STYLE = { background: 'hsl(230,22%,9%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 };

const KPICenterDashboard: React.FC = () => {
  const { cycles, operators, steps, costConfig } = useTimeStudy();
  const { readings } = useSST();
  const [oee, setOee] = useState(72);
  const [daysWithoutAccident, setDaysWithoutAccident] = useState(47);

  // --- Derived KPIs ---
  const kpis = useMemo(() => {
    const totalCycles = cycles.length;
    const avgCycleTime = totalCycles > 0
      ? cycles.reduce((s, c) => s + (c.duration || c.steps.reduce((ss, st) => ss + st.duration, 0)), 0) / totalCycles
      : 0;
    // Tiempo estándar = objetivo de ciclo configurado (no existe estándar por paso en el modelo)
    const stdTime = costConfig.targetCycleTime > 0 ? costConfig.targetCycleTime : avgCycleTime;
    const pct = stdTime > 0 && avgCycleTime > 0 ? Math.round((stdTime / avgCycleTime) * 100) : 0;
    const defectCycles = cycles.filter(c => !c.qualityPass).length;
    const dpm = totalCycles > 0 ? Math.round((defectCycles / totalCycles) * 1_000_000) : 0;
    const qualityPct = totalCycles > 0 ? Math.round(((totalCycles - defectCycles) / totalCycles) * 100) : 99;

    const avgHourlyCost = operators.length > 0 ? operators.reduce((s, o) => s + o.hourlyCost, 0) / operators.length : 15000;
    const dailyLabor = avgHourlyCost * 8 * Math.max(1, operators.length);
    const lossRate = readings.length > 0 ? (readings.filter(r => getLuxCompliance(r.lux) === 'critical' || getDbCompliance(r.db) === 'critical').length / readings.length) * 0.35 : 0.1;
    const dailyLoss = Math.round(dailyLabor * lossRate + operators.length * 80000 * lossRate * 0.1);

    const luxOk = readings.filter(r => getLuxCompliance(r.lux) === 'ok').length;
    const dbOk = readings.filter(r => getDbCompliance(r.db) === 'ok').length;
    const compliancePct = readings.length > 0 ? ((luxOk + dbOk) / (readings.length * 2)) * 100 : 100;
    const roi = dailyLoss > 0 ? Math.round((dailyLoss * 0.7 * 250) / 2500000 * 100) : 0;

    return { totalCycles, avgCycleTime, stdTime, pct, dpm, qualityPct, dailyLoss, compliancePct, roi };
  }, [cycles, operators, steps, readings, costConfig]);

  const alerts = useMemo(() => buildAlerts({
    oee, rulaAvg: 3.2, efficiencyPct: 67, emotionScore: 72, dailyLoss: kpis.dailyLoss, daysWithoutAccident,
  }), [oee, kpis.dailyLoss, daysWithoutAccident]);

  // Simulated weekly trend data
  const weeklyData = useMemo(() => {
    const base = oee;
    return ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map((d, i) => ({
      day: d,
      oee: Math.max(50, Math.min(99, base + (Math.random() - 0.5) * 10 + i * 0.5)),
      eficiencia: Math.max(40, Math.min(95, 67 + (Math.random() - 0.5) * 15 + i)),
      bienestar: Math.max(30, Math.min(100, 72 + (Math.random() - 0.5) * 12)),
    }));
  }, [oee]);

  const operatorKPIs = useMemo(() => operators.map(op => {
    const opCycles = cycles.filter(c => c.operatorId === op.id);
    const defects = opCycles.filter(c => !c.qualityPass).length;
    return {
      name: op.name.length > 10 ? op.name.slice(0, 10) + '…' : op.name,
      ciclos: opCycles.length,
      defectos: defects,
      calidad: opCycles.length > 0 ? Math.round(((opCycles.length - defects) / opCycles.length) * 100) : 100,
    };
  }), [operators, cycles]);

  const exportPDF = () => {
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    doc.setFontSize(20); doc.setTextColor(0, 210, 238);
    doc.text('KRONOS KPI CENTER — Reporte Gerencial', pw / 2, 18, { align: 'center' });
    doc.setFontSize(9); doc.setTextColor(120, 130, 140);
    doc.text(`${new Date().toLocaleDateString('es-CO')} · ${operators.length} operarios · ${cycles.length} ciclos`, pw / 2, 26, { align: 'center' });

    let y = 36;
    doc.setFontSize(13); doc.setTextColor(60, 60, 70);
    doc.text('Indicadores Clave', 14, y); y += 6;
    autoTable(doc, {
      startY: y,
      head: [['KPI', 'Valor', 'Estado']],
      body: [
        ['OEE', `${oee}%`, oee >= 85 ? '✅ Clase mundial' : oee >= 65 ? '⚠️ Mejorable' : '🔴 Crítico'],
        ['Ciclos totales', kpis.totalCycles.toString(), '—'],
        ['Calidad', `${kpis.qualityPct}%`, kpis.qualityPct >= 99 ? '✅' : '⚠️'],
        ['DPM', kpis.dpm.toString(), kpis.dpm < 3400 ? '✅ Six Sigma' : '⚠️'],
        ['Pérdida diaria', `$${kpis.dailyLoss.toLocaleString('es-CO')} COP`, '—'],
        ['Días sin accidente', daysWithoutAccident.toString(), daysWithoutAccident >= 30 ? '✅' : '⚠️'],
        ['Cumplimiento ambiental', `${kpis.compliancePct.toFixed(0)}%`, kpis.compliancePct >= 95 ? '✅' : '⚠️'],
        ['ROI estimado', `${kpis.roi}%`, '—'],
      ],
      headStyles: { fillColor: [0, 180, 210] },
      styles: { fontSize: 9 },
      theme: 'striped',
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    if (operatorKPIs.length > 0) {
      if (y > 220) { doc.addPage(); y = 20; }
      doc.setFontSize(13); doc.text('KPIs por Operario', 14, y); y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Operario', 'Ciclos', 'Defectos', 'Calidad']],
        body: operatorKPIs.map(o => [o.name, o.ciclos, o.defectos, `${o.calidad}%`]),
        headStyles: { fillColor: [0, 180, 210] },
        styles: { fontSize: 9 },
        theme: 'striped',
      });
    }

    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text('Generado por KRONOS.AI — Industrial Intelligence Platform', pw / 2, 290, { align: 'center' });
    doc.save(`kronos_kpi_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportCSV = () => {
    downloadCSV(
      `kronos_kpi_${new Date().toISOString().slice(0, 10)}.csv`,
      ['KPI', 'Valor', 'Unidad'],
      [
        ['OEE', oee, '%'],
        ['Ciclos totales', kpis.totalCycles, 'ciclos'],
        ['Calidad', kpis.qualityPct, '%'],
        ['DPM', kpis.dpm, 'DPM'],
        ['Pérdida diaria', kpis.dailyLoss, 'COP'],
        ['Días sin accidente', daysWithoutAccident, 'días'],
        ['Cumplimiento ambiental', kpis.compliancePct.toFixed(1), '%'],
        ['ROI', kpis.roi, '%'],
      ]
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.2)' }}>
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display font-bold text-lg text-foreground">KPI Center</h2>
            <p className="text-xs text-muted-foreground">Vista gerencial · {new Date().toLocaleDateString('es-CO')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-muted-foreground">Días sin accidente:</span>
            <input
              type="number" min={0} max={9999}
              value={daysWithoutAccident}
              onChange={e => setDaysWithoutAccident(Number(e.target.value))}
              className="input-glass w-20 text-xs text-center py-1"
            />
          </div>
          <button onClick={exportPDF} className="btn-primary-glass flex items-center gap-1.5 text-xs">
            <FileDown className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={exportCSV} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
            <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard label="OEE" value={oee} unit="%" color="#22d3ee" icon={<BarChart3 className="w-4 h-4" />}
          sublabel={oee >= 85 ? 'Clase mundial' : 'Mejorable'} size="lg" />
        <KPICard label="Ciclos" value={kpis.totalCycles} color="#818cf8" icon={<Activity className="w-4 h-4" />}
          sublabel={`${operators.length} operarios`} />
        <KPICard label="Calidad" value={kpis.qualityPct} unit="%" color="#34d399" icon={<Trophy className="w-4 h-4" />}
          sublabel={`DPM: ${kpis.dpm}`} />
        <KPICard label="Seg. sin acc." value={daysWithoutAccident} unit="d" color="#4ade80" icon={<Shield className="w-4 h-4" />}
          sublabel={daysWithoutAccident >= 30 ? 'Excelente historial' : 'Continuar mejorando'} />
        <KPICard label="Pérdida diaria" value={`$${(kpis.dailyLoss / 1000).toFixed(0)}K`} color="#f87171"
          icon={<DollarSign className="w-4 h-4" />} sublabel="COP estimados" />
        <KPICard label="Cumplimiento" value={kpis.compliancePct.toFixed(0)} unit="%" color="#fbbf24"
          icon={<Shield className="w-4 h-4" />} sublabel="Ambiental SST" />
        <KPICard label="ROI Mejoras" value={kpis.roi} unit="%" color="#22d3ee"
          icon={<TrendingUp className="w-4 h-4" />} sublabel="Proyección anual" />
        <KPICard label="Operarios" value={operators.length} color="#818cf8" icon={<Users className="w-4 h-4" />}
          sublabel="Activos" />
        <KPICard label="Eficiencia" value={kpis.pct || '—'} unit="%" color="#a3e635"
          sublabel="Ciclo vs estándar" />
        <KPICard label="Mediciones SST" value={readings.length} color="#5eead4"
          icon={<Activity className="w-4 h-4" />} sublabel="Ambientales" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <h3 className="font-display font-bold text-sm text-foreground mb-4">Tendencia semanal</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="oee" name="OEE" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3, fill: '#22d3ee' }} />
              <Line type="monotone" dataKey="eficiencia" name="Eficiencia" stroke="#818cf8" strokeWidth={2} dot={{ r: 3, fill: '#818cf8' }} />
              <Line type="monotone" dataKey="bienestar" name="Bienestar" stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: '#34d399' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {operatorKPIs.length > 0 ? (
          <div className="glass-card p-4">
            <h3 className="font-display font-bold text-sm text-foreground mb-4">KPIs por operario</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={operatorKPIs}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="ciclos" name="Ciclos" fill="#22d3ee" radius={[3, 3, 0, 0]} />
                <Bar dataKey="calidad" name="Calidad %" fill="#34d399" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="glass-card p-4 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center">Agrega operarios y ciclos para ver el análisis por persona.</p>
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PredictiveAlert alerts={alerts} />
        <OEECalculator onOEEChange={setOee} />
        <div className="space-y-4">
          <BenchmarkPanel myOEE={oee} myRula={3.2} myEfficiency={67} myWellbeing={72} myQuality={kpis.qualityPct} />
        </div>
      </div>

      {/* Certification */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CertificationExport
          oee={oee}
          dailyLoss={kpis.dailyLoss}
          rulaAvg={3.2}
          efficiency={67}
          daysWithoutAccident={daysWithoutAccident}
          complianceRate={kpis.compliancePct}
          readings={readings.map(r => ({ zone: r.zone, lux: r.lux, db: r.db, operatorName: r.operatorName, timestamp: new Date(r.timestamp).getTime() }))}
        />
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <h3 className="font-display font-bold text-sm text-foreground">Operario Destacado</h3>
          </div>
          {operatorKPIs.length > 0 ? (
            <div className="space-y-2">
              {operatorKPIs.sort((a, b) => b.calidad - a.calidad || b.ciclos - a.ciclos).slice(0, 5).map((op, i) => (
                <div key={op.name} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-lg font-bold font-mono text-muted-foreground w-6">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{op.name}</p>
                    <p className="text-xs text-muted-foreground">{op.ciclos} ciclos · {op.calidad}% calidad</p>
                  </div>
                  {i === 0 && <Trophy className="w-4 h-4 text-yellow-400 flex-shrink-0" />}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Agrega operarios y ciclos para ver el ranking.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default KPICenterDashboard;
