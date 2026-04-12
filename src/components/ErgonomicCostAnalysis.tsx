import React, { useState } from "react";
import { useSST, getLuxCompliance, getDbCompliance } from "@/context/SSTContext";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { DollarSign, TrendingDown, TrendingUp, Shield, AlertTriangle, Lightbulb } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COSTS = {
  absenteeismPerDay: 80000,
  hearingLossClaimAvg: 25000000,
  eyeStrainTreatment: 500000,
  luminaire: 350000,
  acousticPanel: 280000,
  eppHearing: 45000,
  eppVision: 85000,
  productivityLossPercent: 0.12,
};

const COLORS = ["#ef4444", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

const ErgonomicCostAnalysis: React.FC = () => {
  const { readings } = useSST();
  const { operators, costConfig } = useTimeStudy();
  const [projMonths, setProjMonths] = useState(12);

  const luxCritical = readings.filter((r) => getLuxCompliance(r.lux) === "critical").length;
  const luxWarning = readings.filter((r) => getLuxCompliance(r.lux) === "warning").length;
  const dbCritical = readings.filter((r) => getDbCompliance(r.db) === "critical").length;
  const dbWarning = readings.filter((r) => getDbCompliance(r.db) === "warning").length;
  const total = readings.length || 1;

  const luxRiskRate = (luxCritical * 0.3 + luxWarning * 0.1) / total;
  const dbRiskRate = (dbCritical * 0.35 + dbWarning * 0.12) / total;

  const absenteeismMonthly = Math.round((luxRiskRate + dbRiskRate) * operators.length * 2 * COSTS.absenteeismPerDay);
  const productivityLoss = Math.round(
    operators.reduce((s, o) => s + o.hourlyCost, 0) * 160 * COSTS.productivityLossPercent * ((luxRiskRate + dbRiskRate) / 2)
  );
  const eppMonthly = Math.round(
    (dbCritical > 0 ? operators.length * COSTS.eppHearing / 6 : 0) +
    (luxCritical > 0 ? operators.length * COSTS.eppVision / 12 : 0)
  );
  const legalRisk = Math.round((dbCritical > 0 ? COSTS.hearingLossClaimAvg * 0.05 : 0) + (luxCritical > 0 ? COSTS.eyeStrainTreatment * luxCritical * 0.2 : 0));

  const totalMonthlyLoss = absenteeismMonthly + productivityLoss + eppMonthly + legalRisk;
  const totalProjected = totalMonthlyLoss * projMonths;

  const luminairesNeeded = luxCritical > 0 ? Math.max(2, Math.ceil(operators.length * 1.5)) : 0;
  const panelsNeeded = dbCritical > 0 ? Math.max(4, operators.length * 2) : 0;
  const improvementCost = luminairesNeeded * COSTS.luminaire + panelsNeeded * COSTS.acousticPanel;
  const roi = improvementCost > 0 ? Math.round(improvementCost / (totalMonthlyLoss || 1)) : 0;
  const annualSaving = totalMonthlyLoss * 12;

  const lossBreakdown = [
    { name: "Ausentismo", value: absenteeismMonthly },
    { name: "Productividad", value: productivityLoss },
    { name: "EPP", value: eppMonthly },
    { name: "Riesgo Legal", value: legalRisk },
  ].filter((d) => d.value > 0);

  const improvementItems = [
    ...(luminairesNeeded > 0 ? [{ name: `${luminairesNeeded} Luminarias LED`, cost: luminairesNeeded * COSTS.luminaire }] : []),
    ...(panelsNeeded > 0 ? [{ name: `${panelsNeeded} Paneles acústicos`, cost: panelsNeeded * COSTS.acousticPanel }] : []),
    ...(dbCritical > 0 ? [{ name: `${operators.length} sets EPP auditivo`, cost: operators.length * COSTS.eppHearing }] : []),
  ];

  const fmt = (n: number) => `$${n.toLocaleString("es-CO")}`;

  if (readings.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <DollarSign className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-40" />
        <h3 className="font-display font-bold text-foreground text-lg mb-2">Fuga de Capital</h3>
        <p className="text-sm text-muted-foreground">Registra mediciones ambientales para calcular el impacto económico.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 border border-destructive/30 bg-destructive/5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <span className="text-xs text-muted-foreground uppercase">Pérdida Mensual</span>
          </div>
          <div className="text-2xl font-bold font-mono text-destructive">{fmt(totalMonthlyLoss)}</div>
        </div>
        <div className="glass-card p-4 border border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-muted-foreground uppercase">Proyección {projMonths}m</span>
          </div>
          <div className="text-2xl font-bold font-mono text-yellow-400">{fmt(totalProjected)}</div>
        </div>
        <div className="glass-card p-4 border border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase">Costo Mejora</span>
          </div>
          <div className="text-2xl font-bold font-mono text-primary">{fmt(improvementCost)}</div>
        </div>
        <div className="glass-card p-4 border border-green-500/30 bg-green-500/5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-xs text-muted-foreground uppercase">ROI</span>
          </div>
          <div className="text-2xl font-bold font-mono text-green-400">{roi} meses</div>
          <p className="text-[10px] text-muted-foreground">Ahorro anual: {fmt(annualSaving)}</p>
        </div>
      </div>

      {/* Projection slider */}
      <div className="glass-card p-4 flex items-center gap-4">
        <label className="text-xs text-muted-foreground uppercase tracking-wider whitespace-nowrap">Proyección:</label>
        <input type="range" min={1} max={36} value={projMonths} onChange={(e) => setProjMonths(Number(e.target.value))} className="flex-1" />
        <span className="text-sm font-mono text-foreground w-16 text-right">{projMonths} meses</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h3 className="font-display font-bold text-sm text-foreground mb-3">💸 Distribución de Pérdidas</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={lossBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {lossBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <h3 className="font-display font-bold text-sm text-foreground mb-3">🔧 Plan de Mejora</h3>
          {improvementItems.length === 0 ? (
            <div className="flex items-center gap-2 text-green-400 py-8 justify-center">
              <Shield className="w-5 h-5" />
              <span className="text-sm">Sin mejoras críticas requeridas</span>
            </div>
          ) : (
            <div className="space-y-3">
              {improvementItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                  <span className="text-sm text-foreground">{item.name}</span>
                  <span className="text-sm font-mono font-bold text-primary">{fmt(item.cost)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/30">
                <span className="text-sm font-bold text-foreground">Total Inversión</span>
                <span className="text-sm font-mono font-bold text-primary">{fmt(improvementCost)}</span>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Retorno en <span className="text-green-400 font-bold">{roi} meses</span> · Ahorro anual: <span className="text-green-400 font-bold">{fmt(annualSaving)}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cost per Operator */}
      <div className="glass-card p-5">
        <h3 className="font-display font-bold text-sm text-foreground mb-3">👷 Costo por Operario (mensual)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={operators.map((op) => {
            const opR = readings.filter((r) => r.operatorId === op.id);
            const opLuxRisk = opR.length > 0 ? opR.filter((r) => getLuxCompliance(r.lux) !== "ok").length / opR.length : 0;
            const opDbRisk = opR.length > 0 ? opR.filter((r) => getDbCompliance(r.db) !== "ok").length / opR.length : 0;
            const loss = Math.round((opLuxRisk + opDbRisk) * op.hourlyCost * 160 * 0.06);
            return { name: op.name, perdida: loss };
          })}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            <Bar dataKey="perdida" fill="#ef4444" name="Pérdida estimada" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ErgonomicCostAnalysis;
