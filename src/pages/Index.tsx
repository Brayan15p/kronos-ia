/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  Timer, ClipboardCheck, AlertTriangle, BarChart3, FileDown,
  Trash2, DollarSign, Dice5, Brain, TrendingUp, Plus, X,
  Zap, ChevronLeft, ChevronRight, Settings2, PenLine,
  Eye, Shield, Activity, ScanEye, Loader2, Download, Upload, Cloud, ClipboardList, Workflow, GraduationCap, FlaskConical, BookOpenCheck, Compass, ListOrdered,
} from "lucide-react";
import { toast } from "sonner";
import { parseStudy, serializeStudy, StudyBackupError } from "@/lib/studyBackup";
import { TimeStudyProvider, useTimeStudy } from "@/context/TimeStudyContext";
import { SSTProvider } from "@/context/SSTContext";

// Cada módulo se descarga solo cuando se abre: la carga inicial pasa de ~1,8 MB a una fracción.
const StepTimer = lazy(() => import("@/components/StepTimer"));
const QualityModule = lazy(() => import("@/components/QualityModule"));
const DefectsModule = lazy(() => import("@/components/DefectsModule"));
const Dashboard = lazy(() => import("@/components/Dashboard"));
const PDFReport = lazy(() => import("@/components/PDFReport"));
const CostAnalysis = lazy(() => import("@/components/CostAnalysis"));
const MonteCarloSimulator = lazy(() => import("@/components/MonteCarloSimulator"));
const FatigueDetection = lazy(() => import("@/components/FatigueDetection"));
const OptimizerAI = lazy(() => import("@/components/OptimizerAI"));
const IncentivesModule = lazy(() => import("@/components/IncentivesModule"));
const StepsConfigPanel = lazy(() => import("@/components/StepsConfigPanel"));
const ManualTimeEntry = lazy(() => import("@/components/ManualTimeEntry"));
const EnvironmentalModule = lazy(() => import("@/components/EnvironmentalModule"));
const Workspace3DModel = lazy(() => import("@/components/Workspace3DModel"));
const SSTDashboard = lazy(() => import("@/components/SSTDashboard"));
const ErgonomicCostAnalysis = lazy(() => import("@/components/ErgonomicCostAnalysis"));
const SSTRecommendations = lazy(() => import("@/components/SSTRecommendations"));
const SGSSTPackage = lazy(() => import("@/components/SGSST/SGSSTPackage"));
const VisionAIDashboard = lazy(() => import("@/components/VisionAI/VisionAIDashboard"));
const KPICenterDashboard = lazy(() => import("@/components/KPICenter/KPICenterDashboard"));
const CloudWorkspace = lazy(() => import("@/components/Cloud/CloudWorkspace"));
const LineBalancing = lazy(() => import("@/components/LineBalance/LineBalancing"));
const DigitalTwin = lazy(() => import("@/components/Twin/DigitalTwin"));
const StandardWork = lazy(() => import("@/components/SOP/StandardWork"));
const PlantCopilot = lazy(() => import("@/components/Copilot/PlantCopilot"));
const SequenceAnalysis = lazy(() => import("@/components/Sequence/SequenceAnalysis"));
const SkillsMatrix = lazy(() => import("@/components/Skills/SkillsMatrix"));

type TabId = "timer" | "manual" | "steps" | "cost" | "montecarlo" | "dashboard" | "fatigue" | "quality" | "defects" | "optimizer" | "incentives" | "report" | "environment" | "workspace3d" | "sst-dashboard" | "ergo-cost" | "sst-ai" | "sgsst" | "vision-ai" | "kpi-center" | "cloud" | "line-balance" | "skills" | "twin" | "sop" | "copilot" | "sequence";

// Navegación por tarea: medir → analizar → mejorar → reportar, con SST como vertical propia.
const TABS: { id: TabId; label: string; icon: React.ElementType; category: string }[] = [
  { id: "timer", label: "Cronómetro", icon: Timer, category: "Medir" },
  { id: "vision-ai", label: "Vision AI", icon: ScanEye, category: "Medir" },
  { id: "manual", label: "Entrada Manual", icon: PenLine, category: "Medir" },
  { id: "quality", label: "Calidad", icon: ClipboardCheck, category: "Medir" },
  { id: "defects", label: "Defectos", icon: AlertTriangle, category: "Medir" },
  { id: "steps", label: "Config. Pasos", icon: Settings2, category: "Medir" },
  { id: "kpi-center", label: "KPI Center", icon: BarChart3, category: "Analizar" },
  { id: "montecarlo", label: "Monte Carlo", icon: Dice5, category: "Analizar" },
  { id: "cost", label: "Fuga de Dinero", icon: DollarSign, category: "Analizar" },
  { id: "fatigue", label: "Fatiga & Training", icon: Brain, category: "Analizar" },
  { id: "skills", label: "Competencias", icon: GraduationCap, category: "Analizar" },
  { id: "sequence", label: "Secuencia del método", icon: ListOrdered, category: "Analizar" },
  { id: "copilot", label: "Copiloto de planta", icon: Compass, category: "Mejorar" },
  { id: "optimizer", label: "AI Optimizer", icon: Zap, category: "Mejorar" },
  { id: "line-balance", label: "Balanceo de línea", icon: Workflow, category: "Mejorar" },
  { id: "twin", label: "Gemelo digital", icon: FlaskConical, category: "Mejorar" },
  { id: "sop", label: "Trabajo estándar", icon: BookOpenCheck, category: "Mejorar" },
  { id: "incentives", label: "Incentivos", icon: TrendingUp, category: "Mejorar" },
  { id: "sst-dashboard", label: "Centro de Mando", icon: Shield, category: "Ergonomía y SST" },
  { id: "environment", label: "Radar Ambiental", icon: Activity, category: "Ergonomía y SST" },
  { id: "workspace3d", label: "Visión Operativa", icon: Eye, category: "Ergonomía y SST" },
  { id: "ergo-cost", label: "Fuga de Capital", icon: DollarSign, category: "Ergonomía y SST" },
  { id: "sst-ai", label: "Motor IA", icon: Brain, category: "Ergonomía y SST" },
  { id: "sgsst", label: "Paquete SG-SST", icon: ClipboardList, category: "Ergonomía y SST" },
  { id: "dashboard", label: "Dashboard", icon: BarChart3, category: "Reportar" },
  { id: "report", label: "Reporte PDF", icon: FileDown, category: "Reportar" },
  { id: "cloud", label: "Nube y equipo", icon: Cloud, category: "Equipo" },
];

const isTabId = (v: string): v is TabId => TABS.some((t) => t.id === v);

/** La pestaña activa vive en la URL (#montecarlo): se puede compartir y el botón atrás funciona. */
function useTabFromHash(): [TabId, (t: TabId) => void] {
  const read = (): TabId => {
    const h = window.location.hash.replace(/^#\/?/, "");
    return isTabId(h) ? h : "timer";
  };
  const [tab, setTab] = useState<TabId>(read);
  useEffect(() => {
    const onHash = () => setTab(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (t: TabId) => {
    if (t !== tab) window.location.hash = t;
    setTab(t);
  };
  return [tab, go];
}

const ModuleFallback = () => (
  <div className="flex items-center justify-center py-24 text-muted-foreground gap-2 text-sm">
    <Loader2 className="w-4 h-4 animate-spin" /> Cargando módulo…
  </div>
);


const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useTabFromHash();
  // En pantallas pequeñas el menú arranca recogido para dejar espacio al contenido.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const study = useTimeStudy();
  const { clearAll, cycles, operators, addOperator, replaceStudy } = study;
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Respaldo del estudio: los datos viven en este navegador, así que se pueden
  // descargar como archivo para no perderlos o para continuar en otro equipo.
  const handleBackup = () => {
    const json = serializeStudy(study);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `kronos-estudio-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Respaldo descargado");
  };

  const handleRestore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = parseStudy(await file.text());
      if (!window.confirm(
        `Se reemplazará el estudio actual (${cycles.length} ciclos) por el del archivo (${data.cycles.length} ciclos). ¿Continuar?`,
      )) return;
      replaceStudy(data);
      toast.success(`Estudio restaurado: ${data.cycles.length} ciclos, ${data.operators.length} operarios`);
    } catch (e) {
      toast.error(e instanceof StudyBackupError ? e.message : "No se pudo leer el archivo.");
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  };

  const handleClear = () => {
    if (cycles.length === 0) return;
    if (window.confirm(
      `Se borrarán ${cycles.length} ciclos con sus defectos y controles de calidad. ` +
      "Esta acción no se puede deshacer (descarga antes un respaldo si lo necesitas). ¿Continuar?",
    )) clearAll();
  };
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
        <div className="p-4 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 glow-primary flex-shrink-0">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <h1 className="text-base font-bold font-display text-gradient-hero tracking-tight">KRONOS.AI</h1>
                <p className="text-[10px] text-muted-foreground truncate">Industrial Intelligence</p>
              </div>
            )}
          </div>
        </div>

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
        <header className="border-b border-border/30 glass-panel rounded-none px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold font-display text-foreground">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h2>
            <p className="text-xs text-muted-foreground">
              {operators.length} operarios · {cycles.length} ciclos registrados
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowAddOp(true)}
              className="btn-secondary-glass flex items-center gap-1.5 text-xs"
              title="Agregar operario"
            >
              <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Operario</span>
            </button>
            <button onClick={handleBackup} className="btn-secondary-glass flex items-center gap-1.5 text-xs" title="Descargar el estudio como archivo" aria-label="Descargar el estudio como archivo">
              <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Respaldo</span>
            </button>
            <button onClick={() => restoreInputRef.current?.click()} className="btn-secondary-glass flex items-center gap-1.5 text-xs" title="Cargar un estudio desde un archivo de respaldo" aria-label="Cargar un estudio desde un archivo de respaldo">
              <Upload className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Restaurar</span>
            </button>
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => handleRestore(e.target.files?.[0])}
            />
            <button onClick={handleClear} title="Borrar los ciclos registrados" aria-label="Borrar los ciclos registrados" disabled={cycles.length === 0} className="btn-secondary-glass flex items-center gap-1.5 text-xs disabled:opacity-40">
              <Trash2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Limpiar</span>
            </button>
          </div>
        </header>

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

        <main className="flex-1 overflow-y-auto scroll-thin p-4 md:p-6">
          <div className="max-w-7xl mx-auto animate-fade-in">
            <Suspense fallback={<ModuleFallback />}>
            {activeTab === "timer" && <StepTimer />}
            {activeTab === "manual" && <ManualTimeEntry />}
            {activeTab === "steps" && <div className="max-w-2xl mx-auto"><StepsConfigPanel /></div>}
            {activeTab === "quality" && <div className="max-w-xl mx-auto"><QualityModule /></div>}
            {activeTab === "defects" && <div className="max-w-xl mx-auto"><DefectsModule /></div>}
            {activeTab === "environment" && <EnvironmentalModule />}
            {activeTab === "workspace3d" && <Workspace3DModel />}
            {activeTab === "sst-dashboard" && <SSTDashboard />}
            {activeTab === "ergo-cost" && <ErgonomicCostAnalysis />}
            {activeTab === "sst-ai" && <SSTRecommendations />}
            {activeTab === "sgsst" && <SGSSTPackage />}
            {activeTab === "vision-ai" && <VisionAIDashboard />}
            {activeTab === "kpi-center" && <KPICenterDashboard />}
            {activeTab === "cost" && <CostAnalysis />}
            {activeTab === "montecarlo" && <MonteCarloSimulator />}
            {activeTab === "fatigue" && <FatigueDetection />}
            {activeTab === "optimizer" && <OptimizerAI />}
            {activeTab === "incentives" && <IncentivesModule />}
            {activeTab === "dashboard" && <Dashboard />}
            {activeTab === "report" && <div className="max-w-3xl mx-auto"><PDFReport /></div>}
            {activeTab === "cloud" && <CloudWorkspace />}
            {activeTab === "line-balance" && <LineBalancing />}
            {activeTab === "twin" && <DigitalTwin />}
            {activeTab === "sop" && <StandardWork />}
            {activeTab === "copilot" && <PlantCopilot />}
            {activeTab === "sequence" && <SequenceAnalysis />}
            {activeTab === "skills" && <SkillsMatrix />}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

const Index: React.FC = () => (
  <TimeStudyProvider>
    <SSTProvider>
      <AppContent />
    </SSTProvider>
  </TimeStudyProvider>
);

export default Index;
