import React, { useState, useCallback, Suspense } from "react";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { useSST, getLuxCompliance, getDbCompliance, type MeasurementPoint3D } from "@/context/SSTContext";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { Plus, Trash2, Sun, Volume2 } from "lucide-react";

const compToHex = (level: "ok" | "warning" | "critical") =>
  level === "ok" ? "#22c55e" : level === "warning" ? "#eab308" : "#ef4444";

const Floor: React.FC = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
    <planeGeometry args={[12, 12]} />
    <meshStandardMaterial color="#334155" transparent opacity={0.9} />
  </mesh>
);

const Desk: React.FC = () => (
  <group position={[0, 0.45, 0]}>
    <mesh position={[0, 0, 0]} castShadow receiveShadow>
      <boxGeometry args={[2.4, 0.06, 1.2]} />
      <meshStandardMaterial color="#78350f" />
    </mesh>
    {[[-1.1, -0.23, -0.5], [1.1, -0.23, -0.5], [-1.1, -0.23, 0.5], [1.1, -0.23, 0.5]].map((pos, i) => (
      <mesh key={i} position={pos as [number, number, number]} castShadow>
        <boxGeometry args={[0.06, 0.45, 0.06]} />
        <meshStandardMaterial color="#451a03" />
      </mesh>
    ))}
  </group>
);

const OperatorFigure: React.FC = () => (
  <group position={[0, 0.48, -0.8]}>
    <mesh position={[0, 0.35, 0]} castShadow>
      <boxGeometry args={[0.4, 0.5, 0.25]} />
      <meshStandardMaterial color="#3b82f6" />
    </mesh>
    <mesh position={[0, 0.7, 0]} castShadow>
      <sphereGeometry args={[0.14, 16, 16]} />
      <meshStandardMaterial color="#fbbf24" />
    </mesh>
    <mesh position={[-0.3, 0.3, 0.15]} castShadow>
      <boxGeometry args={[0.12, 0.35, 0.12]} />
      <meshStandardMaterial color="#3b82f6" />
    </mesh>
    <mesh position={[0.3, 0.3, 0.15]} castShadow>
      <boxGeometry args={[0.12, 0.35, 0.12]} />
      <meshStandardMaterial color="#3b82f6" />
    </mesh>
    <mesh position={[0, -0.05, -0.1]} castShadow>
      <boxGeometry args={[0.45, 0.06, 0.45]} />
      <meshStandardMaterial color="#475569" />
    </mesh>
    <mesh position={[0, 0.2, -0.3]} castShadow>
      <boxGeometry args={[0.45, 0.55, 0.06]} />
      <meshStandardMaterial color="#475569" />
    </mesh>
  </group>
);

const Crane: React.FC = () => (
  <group position={[0.3, 0.52, 0.15]}>
    <mesh castShadow>
      <coneGeometry args={[0.06, 0.12, 4]} />
      <meshStandardMaterial color="#e2e8f0" />
    </mesh>
  </group>
);

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
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={color} transparent opacity={selected ? 1 : 0.8} emissive={color} emissiveIntensity={selected ? 0.6 : 0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.13, 0.16, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* Vertical line to floor */}
      <mesh position={[0, -point.position[1] / 2, 0]}>
        <cylinderGeometry args={[0.005, 0.005, point.position[1], 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </mesh>
      {selected && (
        <Html position={[0, 0.25, 0]} center>
          <div className="glass-card p-2 text-xs min-w-[130px] pointer-events-none" style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(148,163,184,0.3)" }}>
            <p className="font-bold text-white">{point.label}</p>
            <p style={{ color: "#facc15" }}>☀️ {point.lux} lux</p>
            <p style={{ color: "#38bdf8" }}>🔊 {point.db} dB</p>
          </div>
        </Html>
      )}
    </group>
  );
};

// Click planes: floor + vertical planes for placing in operator space
const ClickPlanes: React.FC<{ onPlace: (pos: [number, number, number]) => void; enabled: boolean }> = ({ onPlace, enabled }) => {
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!enabled) return;
    e.stopPropagation();
    const p = e.point;
    onPlace([Math.round(p.x * 10) / 10, Math.max(0.05, Math.round(p.y * 10) / 10), Math.round(p.z * 10) / 10]);
  }, [onPlace, enabled]);

  return (
    <group>
      {/* Floor plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} onClick={handleClick} visible={false}>
        <planeGeometry args={[12, 12]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {/* Vertical XY plane (behind operator) */}
      <mesh position={[0, 1, -1.5]} onClick={handleClick} visible={false}>
        <planeGeometry args={[6, 3]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {/* Vertical XY plane (in front) */}
      <mesh position={[0, 1, 1.5]} onClick={handleClick} visible={false}>
        <planeGeometry args={[6, 3]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {/* Side planes */}
      <mesh position={[-2, 1, 0]} rotation={[0, Math.PI / 2, 0]} onClick={handleClick} visible={false}>
        <planeGeometry args={[6, 3]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <mesh position={[2, 1, 0]} rotation={[0, -Math.PI / 2, 0]} onClick={handleClick} visible={false}>
        <planeGeometry args={[6, 3]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {/* Ceiling plane at operator head height */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.5, 0]} onClick={handleClick} visible={false}>
        <planeGeometry args={[6, 6]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
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

  let ws = workstations.find((w) => w.operatorId === selOp);

  const handlePlace = (pos: [number, number, number]) => {
    let wsId = ws?.id;
    if (!ws) {
      const op = operators.find((o) => o.id === selOp);
      wsId = Date.now();
      addWorkstation({
        id: wsId,
        operatorId: selOp,
        operatorName: op?.name || "Operario",
        zone: "Estación Principal",
        measurementPoints: [],
      });
    }
    const pointId = crypto.randomUUID();
    addMeasurementPoint(wsId!, {
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
              {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Sun className="w-3 h-3" /> Lux</label>
            <input type="number" value={newLux} onChange={(e) => setNewLux(e.target.value)} className="input-glass mt-1 w-24" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Volume2 className="w-3 h-3" /> dB</label>
            <input type="number" value={newDb} onChange={(e) => setNewDb(e.target.value)} className="input-glass mt-1 w-24" />
          </div>
          <button
            onClick={() => setPlacingMode(!placingMode)}
            className={`mt-5 flex items-center gap-2 text-xs ${placingMode ? "btn-primary-glass" : "btn-secondary-glass"}`}
          >
            <Plus className="w-4 h-4" /> {placingMode ? "Click en la escena..." : "Colocar Punto"}
          </button>
          <div className="mt-5 text-xs text-muted-foreground">
            {points.length} puntos · {placingMode && "🎯 Haz clic en la escena 3D (piso, aire o paredes)"}
          </div>
        </div>
      </div>

      {/* 3D Canvas with improved background */}
      <div className="glass-card overflow-hidden rounded-xl" style={{ height: 500 }}>
        <Canvas shadows camera={{ position: [4, 3, 4], fov: 50 }} style={{ background: "linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #334155 100%)" }}>
          <fog attach="fog" args={["#1e293b", 8, 20]} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 8, 5]} intensity={1} castShadow shadow-mapSize={[1024, 1024]} />
          <pointLight position={[-3, 4, -2]} intensity={0.4} color="#38bdf8" />
          <pointLight position={[3, 2, 3]} intensity={0.2} color="#a78bfa" />

          <Suspense fallback={null}>
            <Floor />
            <Desk />
            <OperatorFigure />
            <Crane />
            <gridHelper args={[12, 24, "#475569", "#334155"]} />

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

            <ClickPlanes onPlace={handlePlace} enabled={placingMode} />
          </Suspense>

          <OrbitControls makeDefault enableDamping dampingFactor={0.1} maxPolarAngle={Math.PI / 2.1} />
        </Canvas>
      </div>

      {/* Edit selected point */}
      {selPointData && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <h3 className="font-display font-bold text-sm text-foreground">{selPointData.label}</h3>
            <span className="text-[10px] text-muted-foreground font-mono">
              ({selPointData.position[0]}, {selPointData.position[1]}, {selPointData.position[2]})
            </span>
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
                <p className="text-[10px] text-muted-foreground font-mono">({p.position.join(", ")})</p>
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
