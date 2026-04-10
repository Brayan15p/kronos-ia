import React, { useState, useRef, useCallback, Suspense } from "react";
import { Canvas, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Text, Html } from "@react-three/drei";
import * as THREE from "three";
import { useSST, getLuxCompliance, getDbCompliance, type MeasurementPoint3D } from "@/context/SSTContext";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { Plus, Trash2, Sun, Volume2 } from "lucide-react";

const compToHex = (level: "ok" | "warning" | "critical") =>
  level === "ok" ? "#22c55e" : level === "warning" ? "#eab308" : "#ef4444";

// Floor grid
const Floor: React.FC = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
    <planeGeometry args={[12, 12]} />
    <meshStandardMaterial color="#1a1a2e" transparent opacity={0.8} />
  </mesh>
);

// Desk
const Desk: React.FC = () => (
  <group position={[0, 0.45, 0]}>
    {/* Table top */}
    <mesh position={[0, 0, 0]} castShadow receiveShadow>
      <boxGeometry args={[2.4, 0.06, 1.2]} />
      <meshStandardMaterial color="#3d2b1f" />
    </mesh>
    {/* Legs */}
    {[[-1.1, -0.23, -0.5], [1.1, -0.23, -0.5], [-1.1, -0.23, 0.5], [1.1, -0.23, 0.5]].map((pos, i) => (
      <mesh key={i} position={pos as [number, number, number]} castShadow>
        <boxGeometry args={[0.06, 0.45, 0.06]} />
        <meshStandardMaterial color="#2a1f14" />
      </mesh>
    ))}
  </group>
);

// Simple operator figure (seated)
const Operator: React.FC = () => (
  <group position={[0, 0.48, -0.8]}>
    {/* Body */}
    <mesh position={[0, 0.35, 0]} castShadow>
      <boxGeometry args={[0.4, 0.5, 0.25]} />
      <meshStandardMaterial color="#2563eb" />
    </mesh>
    {/* Head */}
    <mesh position={[0, 0.7, 0]} castShadow>
      <sphereGeometry args={[0.14, 16, 16]} />
      <meshStandardMaterial color="#f5c7a1" />
    </mesh>
    {/* Arms */}
    <mesh position={[-0.3, 0.3, 0.15]} castShadow>
      <boxGeometry args={[0.12, 0.35, 0.12]} />
      <meshStandardMaterial color="#2563eb" />
    </mesh>
    <mesh position={[0.3, 0.3, 0.15]} castShadow>
      <boxGeometry args={[0.12, 0.35, 0.12]} />
      <meshStandardMaterial color="#2563eb" />
    </mesh>
    {/* Chair */}
    <mesh position={[0, -0.05, -0.1]} castShadow>
      <boxGeometry args={[0.45, 0.06, 0.45]} />
      <meshStandardMaterial color="#1e1e2e" />
    </mesh>
    <mesh position={[0, 0.2, -0.3]} castShadow>
      <boxGeometry args={[0.45, 0.55, 0.06]} />
      <meshStandardMaterial color="#1e1e2e" />
    </mesh>
  </group>
);

// Origami crane on desk
const Crane: React.FC = () => (
  <group position={[0.3, 0.52, 0.15]}>
    <mesh castShadow>
      <coneGeometry args={[0.06, 0.12, 4]} />
      <meshStandardMaterial color="#e0e0e0" />
    </mesh>
  </group>
);

// Measurement sphere
const MeasurePoint: React.FC<{
  point: MeasurementPoint3D;
  selected: boolean;
  onSelect: () => void;
}> = ({ point, selected, onSelect }) => {
  const luxLevel = getLuxCompliance(point.lux);
  const dbLevel = getDbCompliance(point.db);
  const worstLevel = luxLevel === "critical" || dbLevel === "critical" ? "critical" : luxLevel === "warning" || dbLevel === "warning" ? "warning" : "ok";
  const color = compToHex(worstLevel);

  return (
    <group position={point.position}>
      <mesh onClick={(e) => { e.stopPropagation(); onSelect(); }}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color={color} transparent opacity={selected ? 1 : 0.7} emissive={color} emissiveIntensity={selected ? 0.5 : 0.2} />
      </mesh>
      {/* Pulse ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.18, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      {selected && (
        <Html position={[0, 0.3, 0]} center>
          <div className="glass-card p-2 text-xs min-w-[120px] pointer-events-none" style={{ background: "rgba(10,10,30,0.9)" }}>
            <p className="font-bold text-foreground">{point.label}</p>
            <p className="text-yellow-400">☀️ {point.lux} lux</p>
            <p className="text-blue-400">🔊 {point.db} dB</p>
          </div>
        </Html>
      )}
    </group>
  );
};

// Click handler for placing new points
const ClickPlane: React.FC<{ onPlace: (pos: [number, number, number]) => void; enabled: boolean }> = ({ onPlace, enabled }) => {
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!enabled) return;
    e.stopPropagation();
    const p = e.point;
    onPlace([Math.round(p.x * 10) / 10, Math.max(0.1, Math.round(p.y * 10) / 10), Math.round(p.z * 10) / 10]);
  }, [onPlace, enabled]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} onClick={handleClick} visible={false}>
      <planeGeometry args={[12, 12]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
};

const Workspace3DModel: React.FC = () => {
  const { operators } = useTimeStudy();
  const { workstations, addWorkstation, addMeasurementPoint, updateMeasurementPoint, removeMeasurementPoint } = useSST();
  const [selOp, setSelOp] = useState(operators[0]?.id ?? 0);
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [placingMode, setPlacingMode] = useState(false);
  const [newLux, setNewLux] = useState("350");
  const [newDb, setNewDb] = useState("72");
  const [editLux, setEditLux] = useState("");
  const [editDb, setEditDb] = useState("");

  // Ensure workstation exists for selected operator
  let ws = workstations.find((w) => w.operatorId === selOp);
  const ensureWs = () => {
    if (!ws) {
      const op = operators.find((o) => o.id === selOp);
      addWorkstation({
        id: Date.now(),
        operatorId: selOp,
        operatorName: op?.name || "Operario",
        zone: "Estación Principal",
        measurementPoints: [],
      });
    }
  };

  const handlePlace = (pos: [number, number, number]) => {
    ensureWs();
    const updatedWs = workstations.find((w) => w.operatorId === selOp);
    const wsId = updatedWs?.id ?? Date.now();
    if (!updatedWs) {
      const op = operators.find((o) => o.id === selOp);
      addWorkstation({
        id: wsId,
        operatorId: selOp,
        operatorName: op?.name || "Operario",
        zone: "Estación Principal",
        measurementPoints: [],
      });
    }
    const pointId = crypto.randomUUID();
    addMeasurementPoint(wsId, {
      id: pointId,
      label: `Punto ${(ws?.measurementPoints.length ?? 0) + 1}`,
      position: pos,
      lux: Number(newLux) || 350,
      db: Number(newDb) || 72,
      operatorId: selOp,
    });
    setPlacingMode(false);
  };

  const handleUpdatePoint = () => {
    if (!ws || !selectedPoint) return;
    updateMeasurementPoint(ws.id, selectedPoint, Number(editLux) || 0, Number(editDb) || 0);
    setSelectedPoint(null);
  };

  const handleDeletePoint = () => {
    if (!ws || !selectedPoint) return;
    removeMeasurementPoint(ws.id, selectedPoint);
    setSelectedPoint(null);
  };

  // Refresh ws reference
  ws = workstations.find((w) => w.operatorId === selOp);
  const points = ws?.measurementPoints ?? [];
  const selPointData = points.find((p) => p.id === selectedPoint);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Operario</label>
            <select value={selOp} onChange={(e) => { setSelOp(Number(e.target.value)); setSelectedPoint(null); }} className="input-glass mt-1">
              {operators.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Sun className="w-3 h-3" /> Lux nuevo</label>
            <input type="number" value={newLux} onChange={(e) => setNewLux(e.target.value)} className="input-glass mt-1 w-24" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Volume2 className="w-3 h-3" /> dB nuevo</label>
            <input type="number" value={newDb} onChange={(e) => setNewDb(e.target.value)} className="input-glass mt-1 w-24" />
          </div>
          <button
            onClick={() => setPlacingMode(!placingMode)}
            className={`mt-5 flex items-center gap-2 text-xs ${placingMode ? "btn-primary-glass" : "btn-secondary-glass"}`}
          >
            <Plus className="w-4 h-4" /> {placingMode ? "Click en la escena..." : "Colocar Punto"}
          </button>
          <div className="mt-5 text-xs text-muted-foreground">
            {points.length} puntos · {placingMode && "🎯 Haz clic en la escena 3D para colocar"}
          </div>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="glass-card overflow-hidden" style={{ height: 480 }}>
        <Canvas shadows camera={{ position: [4, 3, 4], fov: 50 }}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
          <pointLight position={[-3, 4, -2]} intensity={0.3} color="#00d4ff" />

          <Suspense fallback={null}>
            <Floor />
            <Desk />
            <Operator />
            <Crane />
            <gridHelper args={[12, 24, "#333355", "#222244"]} />

            {points.map((point) => (
              <MeasurePoint
                key={point.id}
                point={point}
                selected={selectedPoint === point.id}
                onSelect={() => {
                  setSelectedPoint(selectedPoint === point.id ? null : point.id);
                  if (point.id !== selectedPoint) {
                    setEditLux(String(point.lux));
                    setEditDb(String(point.db));
                  }
                }}
              />
            ))}

            <ClickPlane onPlace={handlePlace} enabled={placingMode} />
          </Suspense>

          <OrbitControls makeDefault enableDamping dampingFactor={0.1} maxPolarAngle={Math.PI / 2.1} />
        </Canvas>
      </div>

      {/* Edit selected point */}
      {selPointData && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <h3 className="font-display font-bold text-sm text-foreground">{selPointData.label}</h3>
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">☀️ Lux</label>
                <input type="number" value={editLux} onChange={(e) => setEditLux(e.target.value)} className="input-glass mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">🔊 dB</label>
                <input type="number" value={editDb} onChange={(e) => setEditDb(e.target.value)} className="input-glass mt-1" />
              </div>
            </div>
            <button onClick={handleUpdatePoint} className="btn-primary-glass text-xs mt-4">Actualizar</button>
            <button onClick={handleDeletePoint} className="btn-secondary-glass text-xs mt-4 text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Points Summary */}
      {points.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="font-display font-bold text-sm text-foreground mb-2">📍 Puntos de Medición</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {points.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelectedPoint(p.id); setEditLux(String(p.lux)); setEditDb(String(p.db)); }}
                className={`p-2 rounded-lg border text-xs text-left transition-all ${
                  selectedPoint === p.id ? "border-primary bg-primary/10" : "border-border/30 bg-muted/20 hover:bg-muted/40"
                }`}
              >
                <p className="font-semibold text-foreground">{p.label}</p>
                <p className="text-yellow-400 font-mono">{p.lux} lux</p>
                <p className="text-blue-400 font-mono">{p.db} dB</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Workspace3DModel;
