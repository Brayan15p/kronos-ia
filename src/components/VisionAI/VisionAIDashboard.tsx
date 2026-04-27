import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Play, Square, Eye, EyeOff, RotateCcw, Cpu, Activity } from 'lucide-react';
import CameraFeed from './CameraFeed';
import TherbligPanel from './TherbligPanel';
import EmotionEngine from './EmotionEngine';
import PostureAnalyzer from './PostureAnalyzer';
import ExpertComparison from './ExpertComparison';
import VirtualObjectSim from './VirtualObjectSim';
import VisionReport from './VisionReport';
import {
  VisionResults, VirtualObjectType, TherbligEvent, TherbligType,
  EmotionState, PostureScore, HeadPose, EyeState, VisionSession,
  SessionSnapshot, ExpertTemplate,
} from './types';
import { classifyTherblig, calculateRULA, analyzeFace, THERBLIG_INFO, ema } from './utils';

const DEBOUNCE_FRAMES  = 6;   // reduced from 12 → snappier
const SNAPSHOT_INTERVAL = 5000;

const VisionAIDashboard: React.FC = () => {
  const [isActive,      setIsActive]      = useState(false);
  const [showSkeleton,  setShowSkeleton]  = useState(true);
  const [virtualObject, setVirtualObject] = useState<VirtualObjectType>('none');
  const [fps,           setFps]           = useState(0);

  // Live state (displayed in UI panels)
  const [currentLeftT,  setCurrentLeftT]  = useState<TherbligType | null>(null);
  const [currentRightT, setCurrentRightT] = useState<TherbligType | null>(null);
  const [currentEmotion,setCurrentEmotion]= useState<EmotionState | null>(null);
  const [currentPosture,setCurrentPosture]= useState<PostureScore | null>(null);
  const [currentHead,   setCurrentHead]   = useState<HeadPose | null>(null);
  const [currentEyes,   setCurrentEyes]   = useState<EyeState | null>(null);
  const [hasHand,       setHasHand]       = useState(false);

  // Session history
  const [therbligHistory, setTherbligHistory] = useState<TherbligEvent[]>([]);
  const [emotionHistory,  setEmotionHistory]  = useState<EmotionState[]>([]);
  const [sessionSeconds,  setSessionSeconds]  = useState(0);
  const [expertTemplate,  setExpertTemplate]  = useState<ExpertTemplate | null>(null);
  const [session, setSession] = useState<VisionSession>({ startTime: Date.now(), endTime: null, snapshots: [], therbligs: [] });

  // Refs for frame-level logic (no stale closures)
  const leftVelRef    = useRef({ x: 0, y: 0 });
  const rightVelRef   = useRef({ x: 0, y: 0 });
  const leftFrameRef  = useRef<{ type: TherbligType; count: number } | null>(null);
  const rightFrameRef = useRef<{ type: TherbligType; count: number } | null>(null);
  const lastLeftRef   = useRef<{ type: TherbligType; startTime: number } | null>(null);
  const lastRightRef  = useRef<{ type: TherbligType; startTime: number } | null>(null);

  const sessionStartRef   = useRef(Date.now());
  const lastSnapshotRef   = useRef(0);
  const therbligRef       = useRef<TherbligEvent[]>([]);
  const snapshotRef       = useRef<SessionSnapshot[]>([]);
  const currentTRef       = useRef<{ l: TherbligType | null; r: TherbligType | null }>({ l: null, r: null });
  const currentEmotRef    = useRef<EmotionState | null>(null);
  const currentPostureRef = useRef<PostureScore | null>(null);
  const currentEarRef     = useRef(0.3);
  // smoothed velocity refs
  const leftSmoothVel  = useRef(0);
  const rightSmoothVel = useRef(0);

  // Timer
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setSessionSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  const handleStart = () => {
    const now = Date.now();
    sessionStartRef.current = now;
    therbligRef.current = [];
    snapshotRef.current = [];
    setSession({ startTime: now, endTime: null, snapshots: [], therbligs: [] });
    setTherbligHistory([]);
    setSessionSeconds(0);
    setIsActive(true);
  };

  const handleStop = () => {
    setIsActive(false);
    setSession({ startTime: sessionStartRef.current, endTime: Date.now(), snapshots: snapshotRef.current, therbligs: therbligRef.current });
  };

  const handleReset = () => {
    setCurrentLeftT(null); setCurrentRightT(null);
    setCurrentEmotion(null); setCurrentPosture(null);
    setCurrentHead(null); setCurrentEyes(null);
    setTherbligHistory([]); setEmotionHistory([]);
    setSessionSeconds(0);
    therbligRef.current = []; snapshotRef.current = [];
    setSession({ startTime: Date.now(), endTime: null, snapshots: [], therbligs: [] });
  };

  const handleResults = useCallback((results: VisionResults) => {
    const now = Date.now();
    const { leftHandLandmarks: lh, rightHandLandmarks: rh, faceLandmarks: face, poseLandmarks: pose } = results;

    setHasHand(!!(lh || rh));

    // ── Hand/Therblig processing ──
    function processHand(
      hand: typeof lh,
      other: typeof lh,
      velRef:   React.MutableRefObject<{ x: number; y: number }>,
      smoothRef:React.MutableRefObject<number>,
      frameRef: React.MutableRefObject<{ type: TherbligType; count: number } | null>,
      lastRef:  React.MutableRefObject<{ type: TherbligType; startTime: number } | null>,
      side: 'left' | 'right',
      setter:    (t: TherbligType | null) => void,
      refSetter: (t: TherbligType | null) => void,
    ) {
      if (!hand) {
        if (lastRef.current) {
          const evt: TherbligEvent = { type: lastRef.current.type, startTime: lastRef.current.startTime, duration: now - lastRef.current.startTime, hand: side };
          therbligRef.current = [...therbligRef.current.slice(-200), evt];
          setTherbligHistory(p => [...p.slice(-200), evt]);
          lastRef.current = null;
        }
        setter(null); refSetter(null); return;
      }

      const w = hand[0];
      const dx = w.x - velRef.current.x;
      const dy = w.y - velRef.current.y;
      const rawVel = Math.sqrt(dx * dx + dy * dy);
      smoothRef.current = ema(smoothRef.current, rawVel, 0.3); // EMA smoothing
      velRef.current = { x: w.x, y: w.y };

      const candidate = classifyTherblig(hand as any, other as any, smoothRef.current);

      if (!frameRef.current || frameRef.current.type !== candidate) {
        frameRef.current = { type: candidate, count: 1 };
      } else {
        frameRef.current.count++;
      }

      if (frameRef.current.count >= DEBOUNCE_FRAMES) {
        const stable = frameRef.current.type;
        if (!lastRef.current || lastRef.current.type !== stable) {
          if (lastRef.current) {
            const evt: TherbligEvent = { type: lastRef.current.type, startTime: lastRef.current.startTime, duration: now - lastRef.current.startTime, hand: side };
            therbligRef.current = [...therbligRef.current.slice(-200), evt];
            setTherbligHistory(p => [...p.slice(-200), evt]);
          }
          lastRef.current = { type: stable, startTime: now };
        }
        setter(stable); refSetter(stable);
      }
    }

    processHand(lh, rh, leftVelRef,  leftSmoothVel,  leftFrameRef,  lastLeftRef,  'left',  setCurrentLeftT,  t => { currentTRef.current.l = t; });
    processHand(rh, lh, rightVelRef, rightSmoothVel, rightFrameRef, lastRightRef, 'right', setCurrentRightT, t => { currentTRef.current.r = t; });

    // ── Face/emotion ──
    if (face) {
      const { emotion, head, eyes } = analyzeFace(face as any);
      setCurrentEmotion(emotion);
      setCurrentHead(head);
      setCurrentEyes(eyes);
      currentEmotRef.current  = emotion;
      currentEarRef.current   = eyes.avgEAR;
      setEmotionHistory(p => [...p.slice(-180), emotion]);
    }

    // ── Posture ──
    if (pose) {
      const ps = calculateRULA(pose as any);
      setCurrentPosture(ps);
      currentPostureRef.current = ps;
    }

    // ── Snapshots ──
    if (now - lastSnapshotRef.current >= SNAPSHOT_INTERVAL) {
      lastSnapshotRef.current = now;
      snapshotRef.current = [...snapshotRef.current, {
        timestamp:    now,
        therblig:     currentTRef.current.r || currentTRef.current.l,
        emotion:      currentEmotRef.current?.level    || 'neutral',
        emotionScore: currentEmotRef.current?.score    || 50,
        rula:         currentPostureRef.current?.rula  || 1,
        ear:          currentEarRef.current,
      }];
    }
  }, []);

  // ── Derived values for HUD + panels ──
  const efficiencyPct = useMemo(() => {
    const recent = therbligHistory.slice(-80);
    if (!recent.length) return 0;
    const total = recent.reduce((s, e) => s + e.duration, 0) || 1;
    const eff   = recent.filter(e => THERBLIG_INFO[e.type]?.efficient).reduce((s, e) => s + e.duration, 0);
    return Math.round((eff / total) * 100);
  }, [therbligHistory]);

  const isDrowsy = !!(currentEyes?.isDrowsy);

  const displaySession: VisionSession = {
    ...session,
    therbligs: therbligHistory,
    snapshots: snapshotRef.current,
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header ── */}
      <div className="glass-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.2)' }}>
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display font-bold text-foreground text-base leading-none">Vision AI</h2>
            <p className="text-xs text-muted-foreground">Análisis ergonómico en tiempo real · ModelX0 (máx. rendimiento)</p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {isActive && fps > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 border border-white/10 text-xs font-mono">
              <Cpu className="w-3 h-3 text-primary" />
              <span className="text-primary">{fps}</span>
              <span className="text-muted-foreground">fps</span>
            </div>
          )}
          {isDrowsy && isActive && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full animate-pulse" style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.4)' }}>
              <span className="text-xs font-bold text-red-400">⚠️ SOMNOLENCIA</span>
            </div>
          )}
          <button onClick={() => setShowSkeleton(s => !s)} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
            {showSkeleton ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {showSkeleton ? 'Ocultar' : 'Skeleton'}
          </button>
          <button onClick={handleReset} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          {!isActive ? (
            <button onClick={handleStart} className="btn-primary-glass flex items-center gap-2">
              <Play className="w-4 h-4" /> Iniciar sesión
            </button>
          ) : (
            <button onClick={handleStop} className="btn-danger-glass flex items-center gap-2">
              <Square className="w-4 h-4" /> Detener
            </button>
          )}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Video + Therbligs (2/3 width) */}
        <div className="xl:col-span-2 space-y-4">
          <CameraFeed
            isActive={isActive}
            onResults={handleResults}
            showSkeleton={showSkeleton}
            virtualObject={virtualObject}
            onFps={setFps}
            liveData={{
              emotionLevel:    currentEmotion?.level    ?? null,
              emotionScore:    currentEmotion?.score    ?? 0,
              posture:         currentPosture,
              therbligL:       currentLeftT,
              therbligR:       currentRightT,
              efficiencyPct,
              isDrowsy,
              therbligHistory,
            }}
          />
          <TherbligPanel
            currentLeft={currentLeftT}
            currentRight={currentRightT}
            history={therbligHistory}
            sessionSeconds={sessionSeconds}
          />
        </div>

        {/* Right panels (1/3 width) */}
        <div className="space-y-4">
          <EmotionEngine current={currentEmotion} history={emotionHistory} />
          <PostureAnalyzer posture={currentPosture} head={currentHead} eyes={currentEyes} />
          <VirtualObjectSim selected={virtualObject} onChange={setVirtualObject} hasHand={hasHand} />
        </div>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExpertComparison
          currentHistory={therbligHistory}
          onSaveTemplate={setExpertTemplate}
          template={expertTemplate}
        />
        <VisionReport session={displaySession} operatorName="Operario" />
      </div>
    </div>
  );
};

export default VisionAIDashboard;
