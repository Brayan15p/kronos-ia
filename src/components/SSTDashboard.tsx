import React, { useMemo } from "react";
import { useSST, getLuxCompliance, getDbCompliance, REGULATIONS, calculateLEQ, calculateDailyDose } from "@/context/SSTContext";
import { useTimeStudy } from "@/context/TimeStudyContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import { AlertTriangle, TrendingDown, TrendingUp, Zap, Shield, Activity, FileDown, FileSpreadsheet } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COLORS = ["#22c55e", "#eab308", "#ef4444"];

const COSTS = {
  absenteeismPerDay: 80000,
  productivityLossPercent: 0.12,
  fatigueImpact: 0.35,
  noiseImpact: 0.25,
  inefficiencyImpact: 0.40,
};

const SSTDashboard: React.FC = () => {
  const { readings, workstations, zones } = useSST();
  const { operators, costConfig } = useTimeStudy();

  const avgLux = readings.length > 0 ? readings.reduce((s, r) => s + r.lux, 0) / readings.length : 0;
  const avgDb = readings.length > 0 ? readings.reduce((s, r) => s + r.db, 0) / readings.length : 0;

  const leq = calculateLEQ(readings.map((r) => ({ db: r.db, exposureHours: r.exposureHours })));
  const avgExposure = readings.length > 0 ? readings.reduce((s, r) => s + r.exposureHours, 0) / readings.length : 8;
  const dailyDose = calculateDailyDose(leq, avgExposure);

  const luxOk = readings.filter((r) => getLuxCompliance(r.lux) === "ok").length;
  const luxWarn = readings.filter((r) => getLuxCompliance(r.lux) === "warning").length;
  const luxCrit = readings.filter((r) => getLuxCompliance(r.lux) === "critical").length;
  const dbOk = readings.filter((r) => getDbCompliance(r.db) === "ok").length;
  const dbWarn = readings.filter((r) => getDbCompliance(r.db) === "warning").length;
  const dbCrit = readings.filter((r) => getDbCompliance(r.db) === "critical").length;

  const compRate = readings.length > 0 ? ((luxOk + dbOk) / (readings.length * 2)) * 100 : 0;
  const riskScore = readings.length > 0
    ? Math.min(100, ((luxWarn + dbWarn) * 15 + (luxCrit + dbCrit) * 35) / readings.length)
    : 0;

  // Efficiency score (0-100)
  const efficiencyScore = Math.max(0, Math.min(100, Math.round(compRate * 0.6 + (100 - riskScore) * 0.4)));

  // Financial calculations
  const avgHourlyCost = operators.length > 0 ? operators.reduce((s, o) => s + o.hourlyCost, 0) / operators.length : 15000;
  const dailyLaborCost = avgHourlyCost * 8 * operators.length;
  const luxRiskRate = readings.length > 0 ? (luxCrit * 0.3 + luxWarn * 0.1) / readings.length : 0;
  const dbRiskRate = readings.length > 0 ? (dbCrit * 0.35 + dbWarn * 0.12) / readings.length : 0;
  const totalRiskRate = luxRiskRate + dbRiskRate;

  const dailyLoss = Math.round(dailyLaborCost * COSTS.productivityLossPercent * totalRiskRate + totalRiskRate * operators.length * COSTS.absenteeismPerDay * 0.1);
  const recoverableLoss = Math.round(dailyLoss * 0.7);

  const fatigueLoss = Math.round(dailyLoss * COSTS.fatigueImpact);
  const noiseLoss = Math.round(dailyLoss * COSTS.noiseImpact);
  const inefficiencyLoss = Math.round(dailyLoss * COSTS.inefficiencyImpact);

  const trendUp = riskScore > 30;
  const fmt = (n: number) => `$${n.toLocaleString("es-CO")}`;

  // Alerts
  const alerts = useMemo(() => {
    const a: { title: string; severity: "critical" | "warning" }[] = [];
    if (luxCrit > 0) a.push({ title: `${luxCrit} medición(es) de luz fuera de norma`, severity: "critical" });
    if (dbCrit > 0) a.push({ title: `${dbCrit} medición(es) de ruido exceden límite`, severity: "critical" });
    if (dailyDose > 100) a.push({ title: `Dosis diaria de ruido: ${dailyDose.toFixed(0)}% (excede 100%)`, severity: "critical" });
    if (dailyDose > 50 && dailyDose <= 100) a.push({ title: `Dosis diaria al ${dailyDose.toFixed(0)}% — monitorear`, severity: "warning" });
    if (luxWarn > 2) a.push({ title: "Múltiples advertencias de iluminación", severity: "warning" });
    if (efficiencyScore < 50) a.push({ title: "Eficiencia operativa por debajo del 50%", severity: "warning" });
    return a;
  }, [luxCrit, dbCrit, dailyDose, luxWarn, efficiencyScore]);

  // Radar data
  const radarData = operators.map((op) => {
    const opR = readings.filter((r) => r.operatorId === op.id);
    const luxScore = opR.length > 0 ? (opR.filter((r) => getLuxCompliance(r.lux) === "ok").length / opR.length) * 100 : 0;
    const dbScore = opR.length > 0 ? (opR.filter((r) => getDbCompliance(r.db) === "ok").length / opR.length) * 100 : 0;
    return { name: op.name, luz: Math.round(luxScore), sonido: Math.round(dbScore), general: Math.round((luxScore + dbScore) / 2) };
  });

  const luxPieData = [
    { name: "Cumple", value: luxOk },
    { name: "Advertencia", value: luxWarn },
    { name: "Crítico", value: luxCrit },
  ].filter((d) => d.value > 0);

  const dbPieData = [
    { name: "Cumple", value: dbOk },
    { name: "Advertencia", value: dbWarn },
    { name: "Crítico", value: dbCrit },
  ].filter((d) => d.value > 0);

  const zoneAnalysis = useMemo(() => {
    const uniqueZones = [...new Set(readings.map((r) => r.zone))];
    return uniqueZones.map((z) => {
      const zR = readings.filter((r) => r.zone === z);
      return {
        name: z.length > 12 ? z.slice(0, 12) + "…" : z,
        lux: Math.round(zR.reduce((s, r) => s + r.lux, 0) / zR.length),
        db: Math.round(zR.reduce((s, r) => s + r.db, 0) / zR.length),
        leq: Math.round(calculateLEQ(zR.map((r) => ({ db: r.db, exposureHours: r.exposureHours })))),
      };
    });
  }, [readings]);

  // Score color
  const scoreColor = efficiencyScore >= 70 ? "#22c55e" : efficiencyScore >= 40 ? "#eab308" : "#ef4444";
  const scoreGradient = `conic-gradient(${scoreColor} ${efficiencyScore * 3.6}deg, hsl(var(--muted)) 0deg)`;

  // Export Excel
  const exportExcel = () => {
    const headers = ["Operario", "Zona", "Lux", "dB", "Exposición (h)", "Fecha", "Hora", "Notas"];
    const rows = readings.map((r) => [
      r.operatorName, r.zone, r.lux, r.db, r.exposureHours,
      new Date(r.timestamp).toLocaleDateString("es-CO"),
      new Date(r.timestamp).toLocaleTimeString("es-CO"),
      r.notes,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kronos_sst_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Generate PDF
  const generatePDF = () => {
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();

    doc.setFontSize(20);
    doc.setTextColor(0, 200, 220);
    doc.text("KRONOS.AI — Reporte SST Inteligente", pw / 2, 20, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-CO")} | Operarios: ${operators.length} | Mediciones: ${readings.length}`, pw / 2, 28, { align: "center" });

    let y = 40;
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text("Resumen Ejecutivo", 14, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [["Métrica", "Valor"]],
      body: [
        ["Eficiencia Operativa", `${efficiencyScore}/100`],
        ["Pérdida Diaria Estimada", fmt(dailyLoss)],
        ["Capital Recuperable", fmt(recoverableLoss)],
        ["LEQ Diario", `${leq.toFixed(1)} dB`],
        ["Dosis Diaria", `${dailyDose.toFixed(0)}%`],
        ["Cumplimiento Normativo", `${compRate.toFixed(0)}%`],
        ["Alertas Críticas", `${luxCrit + dbCrit}`],
      ],
      theme: "striped",
      headStyles: { fillColor: [0, 180, 200] },
      styles: { fontSize: 9 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    if (alerts.length > 0) {
      doc.setFontSize(14);
      doc.text("Alertas Detectadas", 14, y);
      y += 8;
      autoTable(doc, {
        startY: y,
        head: [["Alerta", "Severidad"]],
        body: alerts.map((a) => [a.title, a.severity === "critical" ? "CRÍTICA" : "ADVERTENCIA"]),
        theme: "striped",
        headStyles: { fillColor: [200, 60, 60] },
        styles: { fontSize: 8 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    if (readings.length > 0) {
      if (y > 200) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.text("Mediciones Ambientales", 14, y);
      y += 8;
      autoTable(doc, {
        startY: y,
        head: [["Operario", "Zona", "Lux", "dB", "Exp (h)", "Fecha"]],
        body: readings.map((r) => [
          r.operatorName, r.zone, r.lux.toString(), r.db.toString(),
          r.exposureHours.toString(), new Date(r.timestamp).toLocaleDateString("es-CO"),
        ]),
        theme: "striped",
        headStyles: { fillColor: [0, 180, 200] },
        styles: { fontSize: 7 },
      });
    }

    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Generado por KRONOS.AI — Industrial Intelligence Platform", pw / 2, 290, { align: "center" });
    doc.save(`kronos_sst_reporte_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (readings.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-40" />
        <h3 className="font-display font-bold text-foreground text-lg mb-2">Centro de Mando SST</h3>
        <p className="text-sm text-muted-foreground">Registra mediciones ambientales en el Radar Ambiental para activar el centro de mando.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HERO: Loss Panel */}
      <div className="glass-card p-6 border border-destructive/20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 via-transparent to-primary/5 pointer-events-none" />
        <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Loss KPI */}
          <div className="lg:col-span-2">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">💸 Impacto Financiero Diario</p>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl md:text-5xl font-bold font-mono text-destructive">{fmt(dailyLoss)}</span>
              <span className="text-sm text-muted-foreground">COP perdidos hoy</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-lg font-bold font-mono text-green-400">Recuperables: {fmt(recoverableLoss)}</span>
              {trendUp ? (
                <TrendingUp className="w-4 h-4 text-destructive" />
              ) : (
                <TrendingDown className="w-4 h-4 text-green-400" />
              )}
            </div>

            {/* Breakdown bars */}
            <div className="mt-4 space-y-2">
              {[
                { label: "Fatiga", value: fatigueLoss, pct: COSTS.fatigueImpact * 100, color: "#a855f7" },
                { label: "Ruido", value: noiseLoss, pct: COSTS.noiseImpact * 100, color: "#38bdf8" },
                { label: "Ineficiencia", value: inefficiencyLoss, pct: COSTS.inefficiencyImpact * 100, color: "#ef4444" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20">{item.label}</span>
                  <div className="flex-1 h-3 rounded-full bg-muted/30 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${item.pct}%`, background: item.color }} />
                  </div>
                  <span className="text-xs font-mono text-foreground w-24 text-right">{fmt(item.value)} <span className="text-muted-foreground">({item.pct}%)</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* Efficiency Score */}
          <div className="flex flex-col items-center justify-center">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Eficiencia Operativa</p>
            <div className="relative w-36 h-36">
              <div className="absolute inset-0 rounded-full" style={{ background: scoreGradient }} />
              <div className="absolute inset-2 rounded-full bg-background flex items-center justify-center flex-col">
                <span className="text-3xl font-bold font-mono" style={{ color: scoreColor }}>{efficiencyScore}</span>
                <span className="text-xs text-muted-foreground">/100</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {efficiencyScore >= 70 ? "✅ Rendimiento óptimo" : efficiencyScore >= 40 ? "⚠️ Requiere atención" : "🔴 Acción urgente"}
            </p>
          </div>
        </div>
      </div>

      {/* Smart Alerts */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`glass-card p-4 border transition-all hover:scale-[1.02] ${
                alert.severity === "critical"
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-yellow-500/40 bg-yellow-500/5"
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${alert.severity === "critical" ? "text-destructive" : "text-yellow-400"}`} />
                <p className="text-xs text-foreground">{alert.title}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Export Buttons */}
      <div className="flex gap-3">
        <button onClick={generatePDF} className="btn-primary-glass flex items-center gap-2 text-sm">
          <FileDown className="w-4 h-4" /> Generar Reporte Inteligente
        </button>
        <button onClick={exportExcel} className="btn-secondary-glass flex items-center gap-2 text-sm">
          <FileSpreadsheet className="w-4 h-4" /> Exportar Datos SST
        </button>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <h3 className="font-display font-bold text-sm text-foreground mb-3">☀️ Cumplimiento Luz</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={luxPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {luxPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card p-5">
          <h3 className="font-display font-bold text-sm text-foreground mb-3">🔊 Cumplimiento Sonido</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={dbPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {dbPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card p-5">
          <h3 className="font-display font-bold text-sm text-foreground mb-3">🎯 Radar por Operario</h3>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
              <Radar name="Luz" dataKey="luz" stroke="#eab308" fill="#eab308" fillOpacity={0.2} />
              <Radar name="Sonido" dataKey="sonido" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.2} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Zone Analysis */}
      {zoneAnalysis.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="font-display font-bold text-sm text-foreground mb-3">📊 Análisis por Zona</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={zoneAnalysis}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="lux" fill="#eab308" name="Prom. Lux" radius={[4, 4, 0, 0]} />
              <Bar dataKey="db" fill="#38bdf8" name="Prom. dB" radius={[4, 4, 0, 0]} />
              <Bar dataKey="leq" fill="#a78bfa" name="LEQ" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default SSTDashboard;
