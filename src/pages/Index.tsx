import React, { useState } from "react";
import {
  Timer, ClipboardCheck, AlertTriangle, BarChart3, FileDown,
  Trash2, DollarSign, Dice5, Brain, TrendingUp, Plus, X, Users,
  Zap, ChevronLeft, ChevronRight,
} from "lucide-react";
import { TimeStudyProvider, useTimeStudy } from "@/context/TimeStudyContext";
import StepTimer from "@/components/StepTimer";
import QualityModule from "@/components/QualityModule";
import DefectsModule from "@/components/DefectsModule";
import Dashboard from "@/components/Dashboard";
import PDFReport from "@/components/PDFReport";
import CostAnalysis from "@/components/CostAnalysis";
import MonteCarloSimulator from "@/components/MonteCarloSimulator";
import FatigueDetection from "@/components/FatigueDetection";
import OptimizerAI from "@/components/OptimizerAI";
import IncentivesModule from "@/components/IncentivesModule";

type TabId = "timer" | "cost" | "montecarlo" | "dashboard" | "fatigue" | "quality" | "defects" | "optimizer" | "incentives" | "report";

const TABS: { id: TabId; label: string; icon: React.ElementType; category: string }[] = [
  { id: "timer", label: "Cronómetro", icon: Timer, category: "Operaciones" },
  { id: "quality", label: "Calidad", icon: ClipboardCheck, category: "Operaciones" },
  { id: "defects", label: "Defectos", icon: AlertTriangle, category: "Operaciones" },
  { id: "cost", label: "Fuga de Dinero", icon: DollarSign, category: "Inteligencia" },
  { id: "montecarlo", label: "Monte Carlo", icon: Dice5, category: "Inteligencia" },
  { id: "fatigue", label: "Fatiga & Training", icon: Brain, category: "Inteligencia" },
  { id: "optimizer", label: "AI Optimizer", icon: Zap, category: "Inteligencia" },
  { id: "incentives", label: "Incentivos", icon: TrendingUp, category: "Estrategia" },
  { id: "dashboard", label: "Dashboard", icon: BarChart3, category: "Reportes" },
  { id: "report", label: "Reporte PDF", icon: FileDown, category: "Reportes" },
];

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>("timer");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { clearAll, cycles, operators, addOperator } = useTimeStudy();
  const [showAddOp, setShowAddOp] = useState(false);
  const [newOpName, setNewOpName] = useState("");
  const [newOpCost, setNewOpCost] = useState("15000");

  const handleAddOperator = () => {
    if (!newOpName.trim()) return;
    addOperator(newOpName.trim(), Number(newOpCost) || 15000);
    setNewOpName("");
    setNewOpCost("15000");
    setShowAddOp(false);
  };

  const categories = [...new Set(TABS.map((t) => t.category))];

  return (
    <div className="min-h-screen bg-background flex">
      <div className="mesh-gradient" />

      {/* Sidebar */}
      <aside
        className={`glass-sidebar flex-shrink-0 flex flex-col transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-16"
        }`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 glow-primary flex-shrink-0">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <h1 className="text-base font-bold font-display text-gradient-hero tracking-tight">NEXORA.AI</h1>
                <p className="text-[10px] text-muted-foreground truncate">Industrial Intelligence</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto scroll-thin">
          {categories.map((cat) => (
            <div key={cat}>
              {sidebarOpen && (
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold px-3 mb-1.5">{cat}</p>
              )}
              <div className="space-y-0.5">
                {TABS.filter((t) => t.category === cat).map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`sidebar-item w-full ${isActive ? "sidebar-item-active" : ""}`}
                      title={tab.label}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {sidebarOpen && <span className="truncate">{tab.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="p-3 border-t border-border/30">
          {sidebarOpen && (
            <div className="glass-card px-3 py-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="pulse-dot" />
                <span className="text-xs font-mono text-muted-foreground">{cycles.length} ciclos</span>
              </div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="sidebar-item w-full justify-center"
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="border-b border-border/30 glass-panel rounded-none px-6 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold font-display text-foreground">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h2>
            <p className="text-xs text-muted-foreground">
              {operators.length} operarios · {cycles.length} ciclos registrados
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddOp(true)}
              className="btn-secondary-glass flex items-center gap-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Operario
            </button>
            <button onClick={clearAll} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
              <Trash2 className="w-3.5 h-3.5" /> Limpiar
            </button>
          </div>
        </header>

        {/* Add operator modal */}
        {showAddOp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="glass-card p-6 w-full max-w-sm space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-foreground">Nuevo Operario</h3>
                <button onClick={() => setShowAddOp(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Nombre</label>
                <input
                  value={newOpName}
                  onChange={(e) => setNewOpName(e.target.value)}
                  placeholder="Ej: María López"
                  className="input-glass mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Costo por hora (COP)</label>
                <input
                  type="number"
                  value={newOpCost}
                  onChange={(e) => setNewOpCost(e.target.value)}
                  className="input-glass mt-1"
                />
              </div>
              <button onClick={handleAddOperator} className="btn-primary-glass w-full">
                Agregar Operario
              </button>
            </div>
          </div>
        )}

        {/* Content area */}
        <main className="flex-1 overflow-y-auto scroll-thin p-6">
          <div className="max-w-7xl mx-auto animate-fade-in">
            {activeTab === "timer" && <StepTimer />}
            {activeTab === "quality" && <div className="max-w-xl mx-auto"><QualityModule /></div>}
            {activeTab === "defects" && <div className="max-w-xl mx-auto"><DefectsModule /></div>}
            {activeTab === "cost" && <CostAnalysis />}
            {activeTab === "montecarlo" && <MonteCarloSimulator />}
            {activeTab === "fatigue" && <FatigueDetection />}
            {activeTab === "optimizer" && <OptimizerAI />}
            {activeTab === "incentives" && <IncentivesModule />}
            {activeTab === "dashboard" && <Dashboard />}
            {activeTab === "report" && <div className="max-w-3xl mx-auto"><PDFReport /></div>}
          </div>
        </main>
      </div>
    </div>
  );
};

const Index: React.FC = () => (
  <TimeStudyProvider>
    <AppContent />
  </TimeStudyProvider>
);

export default Index;
