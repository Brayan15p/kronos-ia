import React, { useState } from "react";
import { Timer, ClipboardCheck, AlertTriangle, BarChart3, FileDown, Trash2 } from "lucide-react";
import { TimeStudyProvider, useTimeStudy } from "@/context/TimeStudyContext";
import OperatorTimer from "@/components/OperatorTimer";
import QualityModule from "@/components/QualityModule";
import DefectsModule from "@/components/DefectsModule";
import Dashboard from "@/components/Dashboard";
import PDFReport from "@/components/PDFReport";

type TabId = "operators" | "quality" | "defects" | "dashboard" | "report";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "operators", label: "Operarios", icon: Timer },
  { id: "quality", label: "Calidad", icon: ClipboardCheck },
  { id: "defects", label: "Defectos", icon: AlertTriangle },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "report", label: "Reporte", icon: FileDown },
];

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>("operators");
  const { clearAll, cycles } = useTimeStudy();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 glass-panel rounded-none">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 glow-primary">
              <Timer className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">TimeStudy</h1>
              <p className="text-xs text-muted-foreground">Estudio de Tiempos — Grulla de Origami</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 glass-card px-3 py-1.5">
              <div className="pulse-dot" />
              <span className="text-xs font-mono text-muted-foreground">{cycles.length} ciclos</span>
            </div>
            <button onClick={clearAll} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
              <Trash2 className="w-3.5 h-3.5" /> Limpiar
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="max-w-7xl mx-auto px-4 pt-4">
        <div className="flex gap-1 p-1 glass-card rounded-xl w-fit">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/20 glow-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "operators" && (
          <div className="grid md:grid-cols-2 gap-6">
            <OperatorTimer operatorId={1} operatorName="Operario 1" />
            <OperatorTimer operatorId={2} operatorName="Operario 2" />
          </div>
        )}
        {activeTab === "quality" && (
          <div className="max-w-xl mx-auto">
            <QualityModule />
          </div>
        )}
        {activeTab === "defects" && (
          <div className="max-w-xl mx-auto">
            <DefectsModule />
          </div>
        )}
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "report" && (
          <div className="max-w-3xl mx-auto">
            <PDFReport />
          </div>
        )}
      </main>
    </div>
  );
};

const Index: React.FC = () => (
  <TimeStudyProvider>
    <AppContent />
  </TimeStudyProvider>
);

export default Index;
