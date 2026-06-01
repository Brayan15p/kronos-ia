import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, WifiOff } from 'lucide-react';
import type {
  GestureRecognizer as GRType,
  PoseLandmarker   as PLType,
  FaceLandmarker   as FLType,
  ObjectDetector   as ODType,
} from '@mediapipe/tasks-vision';
import {
  VisionResults, VirtualObjectType, TherbligType, TherbligEvent,
  EmotionLevel, PostureScore, GestureType, HandState, BlendshapeCategory,
  DetectedObject,
} from './types';
import { THERBLIG_INFO, EMOTION_INFO, GESTURE_DISPLAY, classifyHandState } from './utils';

// ── Lazy module loader (loaded once, cached) ──────────────────────────────────
let _tv: typeof import('@mediapipe/tasks-vision') | null = null;
async function loadTV() {
  if (!_tv) _tv = await import('@mediapipe/tasks-vision');
  return _tv;
}

const WASM_CDN  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_GES = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const MODEL_POS = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const MODEL_FAC = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MODEL_OBJ = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

// ── Object metadata (COCO → emoji / color / Spanish) ─────────────────────────
const OBJ_META: Record<string, { emoji: string; color: string; es: string }> = {
  'scissors':      { emoji:'✂️',  color:'#f59e0b', es:'Tijeras'     },
  'bottle':        { emoji:'🍶',  color:'#22d3ee', es:'Botella'     },
  'cup':           { emoji:'☕',  color:'#f97316', es:'Taza'        },
  'book':          { emoji:'📖',  color:'#818cf8', es:'Libro'       },
  'cell phone':    { emoji:'📱',  color:'#34d399', es:'Celular'     },
  'remote':        { emoji:'📡',  color:'#a3e635', es:'Control'     },
  'keyboard':      { emoji:'⌨️',  color:'#60a5fa', es:'Teclado'     },
  'mouse':         { emoji:'🖱️',  color:'#c084fc', es:'Mouse'       },
  'laptop':        { emoji:'💻',  color:'#2dd4bf', es:'Laptop'      },
  'knife':         { emoji:'🔪',  color:'#f43f5e', es:'Cuchillo'    },
  'fork':          { emoji:'🍴',  color:'#e879f9', es:'Tenedor'     },
  'spoon':         { emoji:'🥄',  color:'#fbbf24', es:'Cuchara'     },
  'pen':           { emoji:'✏️',  color:'#facc15', es:'Lapicero'    },
  'pencil':        { emoji:'✏️',  color:'#facc15', es:'Lápiz'       },
  'clock':         { emoji:'🕐',  color:'#94a3b8', es:'Reloj'       },
  'toothbrush':    { emoji:'🪥',  color:'#22d3ee', es:'Cepillo'     },
  'hair drier':    { emoji:'💨',  color:'#60a5fa', es:'Secador'     },
  'umbrella':      { emoji:'☂️',  color:'#818cf8', es:'Paraguas'    },
  'handbag':       { emoji:'👜',  color:'#f472b6', es:'Cartera'     },
  'backpack':      { emoji:'🎒',  color:'#f59e0b', es:'Morral'      },
  'suitcase':      { emoji:'🧳',  color:'#94a3b8', es:'Maleta'      },
  'sports ball':   { emoji:'⚽',  color:'#22d3ee', es:'Pelota'      },
  'baseball bat':  { emoji:'🏏',  color:'#f59e0b', es:'Bate'        },
  'wine glass':    { emoji:'🍷',  color:'#f43f5e', es:'Copa'        },
  'banana':        { emoji:'🍌',  color:'#fbbf24', es:'Banano'      },
  'apple':         { emoji:'🍎',  color:'#f43f5e', es:'Manzana'     },
  'orange':        { emoji:'🍊',  color:'#f97316', es:'Naranja'     },
  'sandwich':      { emoji:'🥪',  color:'#fbbf24', es:'Sándwich'    },
  'pizza':         { emoji:'🍕',  color:'#f43f5e', es:'Pizza'       },
  'donut':         { emoji:'🍩',  color:'#f472b6', es:'Dona'        },
  'cake':          { emoji:'🎂',  color:'#f472b6', es:'Torta'       },
  'chair':         { emoji:'🪑',  color:'#94a3b8', es:'Silla'       },
  'tv':            { emoji:'📺',  color:'#22d3ee', es:'Televisor'   },
  'teddy bear':    { emoji:'🧸',  color:'#f97316', es:'Peluche'     },
  // Herramientas industriales adicionales
  'bicycle':       { emoji:'🚲',  color:'#60a5fa', es:'Bicicleta'   },
  'motorcycle':    { emoji:'🏍️',  color:'#f97316', es:'Moto'        },
  'car':           { emoji:'🚗',  color:'#22d3ee', es:'Carro'        },
  'truck':         { emoji:'🚛',  color:'#94a3b8', es:'Camión'       },
  'bench':         { emoji:'🪑',  color:'#a3e635', es:'Banco'        },
  'sink':          { emoji:'🚿',  color:'#22d3ee', es:'Lavamanos'    },
  'refrigerator':  { emoji:'🧊',  color:'#60a5fa', es:'Nevera'       },
  'microwave':     { emoji:'📡',  color:'#94a3b8', es:'Microondas'   },
  'oven':          { emoji:'🔥',  color:'#f97316', es:'Horno'        },
  'toaster':       { emoji:'🍞',  color:'#fbbf24', es:'Tostador'     },
  'couch':         { emoji:'🛋️',  color:'#818cf8', es:'Sofá'         },
  'potted plant':  { emoji:'🪴',  color:'#4ade80', es:'Planta'       },
  'bed':           { emoji:'🛏️',  color:'#a78bfa', es:'Cama'         },
  'dining table':  { emoji:'🪵',  color:'#f59e0b', es:'Mesa'         },
  'vase':          { emoji:'🏺',  color:'#f472b6', es:'Florero'      },
  'broccoli':      { emoji:'🥦',  color:'#4ade80', es:'Brócoli'      },
  'carrot':        { emoji:'🥕',  color:'#f97316', es:'Zanahoria'    },
  'hot dog':       { emoji:'🌭',  color:'#f97316', es:'Salchicha'    },
  'kite':          { emoji:'🪁',  color:'#818cf8', es:'Cometa'       },
  'frisbee':       { emoji:'🥏',  color:'#f43f5e', es:'Frisbee'      },
  'baseball bat':  { emoji:'🏏',  color:'#f59e0b', es:'Bate'         },
  'baseball glove':{ emoji:'🧤',  color:'#f97316', es:'Guante'       },
  'skateboard':    { emoji:'🛹',  color:'#818cf8', es:'Patineta'     },
  'surfboard':     { emoji:'🏄',  color:'#22d3ee', es:'Tabla'        },
  'tennis racket': { emoji:'🎾',  color:'#a3e635', es:'Raqueta'      },
  'wine glass':    { emoji:'🍷',  color:'#f43f5e', es:'Copa'         },
  'banana':        { emoji:'🍌',  color:'#fbbf24', es:'Banano'       },
  'apple':         { emoji:'🍎',  color:'#f43f5e', es:'Manzana'      },
  'orange':        { emoji:'🍊',  color:'#f97316', es:'Naranja'      },
  'sandwich':      { emoji:'🥪',  color:'#fbbf24', es:'Sándwich'     },
  'pizza':         { emoji:'🍕',  color:'#f43f5e', es:'Pizza'        },
  'donut':         { emoji:'🍩',  color:'#f472b6', es:'Dona'         },
  'cake':          { emoji:'🎂',  color:'#f472b6', es:'Torta'        },
  'bowl':          { emoji:'🥣',  color:'#fb7185', es:'Tazón'        },
  'tie':           { emoji:'👔',  color:'#60a5fa', es:'Corbata'      },
  'skis':          { emoji:'⛷️',  color:'#22d3ee', es:'Esquís'       },
  'tv':            { emoji:'📺',  color:'#22d3ee', es:'Televisor'    },
  'toilet':        { emoji:'🚽',  color:'#94a3b8', es:'Inodoro'      },
};
function getObjMeta(cat: string) {
  return OBJ_META[cat] ?? { emoji: '📦', color: '#94a3b8', es: cat.charAt(0).toUpperCase() + cat.slice(1) };
}

/** Find which detected object is closest to the hand palm center */
function findObjectNearHand(
  hand: any[], detections: DetectedObject[], vW: number, vH: number,
): DetectedObject | null {
  if (!hand?.length || !detections.length) return null;
  const pts = [hand[0], hand[5], hand[9], hand[13], hand[17]].filter(Boolean);
  const palmX = pts.reduce((s, p) => s + p.x * vW, 0) / pts.length;
  const palmY = pts.reduce((s, p) => s + p.y * vH, 0) / pts.length;
  let best: DetectedObject | null = null;
  let bestD = Infinity;
  for (const det of detections) {
    const bb = det.boundingBox;
    const cx = bb.originX + bb.width  / 2;
    const cy = bb.originY + bb.height / 2;
    const d  = Math.hypot(palmX - cx, palmY - cy);
    const threshold = Math.hypot(bb.width, bb.height) * 0.75;
    if (d < threshold && d < bestD) { bestD = d; best = det; }
  }
  return best;
}

const MAX_TRAIL    = 30;
const MAX_PARTICLES = 80;

function ha(color: string, alpha: number): string {
  return color + Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
}

function playBeep(freq = 660, dur = 0.28) {
  try {
    const ac = new AudioContext(); const osc = ac.createOscillator(); const g = ac.createGain();
    osc.connect(g); g.connect(ac.destination);
    osc.frequency.value = freq; g.gain.value = 0.07;
    osc.start(); osc.stop(ac.currentTime + dur);
    setTimeout(() => ac.close(), 1200);
  } catch {}
}

// ── Virtual object colors / drawing ──────────────────────────────────────────
const OBJ_COLOR: Record<string, string> = {
  caja:'#22d3ee', herramienta:'#f59e0b', componente:'#818cf8', pantalla:'#34d399',
  boton:'#f43f5e', martillo:'#fb923c', tornillo:'#a3e635', destornillador:'#e879f9',
  pcb:'#34d399', engranaje:'#fbbf24', palanca:'#60a5fa',
};

function drawObject(ctx: CanvasRenderingContext2D, ox: number, oy: number, type: VirtualObjectType, objScale: number, isGrabbed: boolean) {
  if (type === 'none') return;
  const color = OBJ_COLOR[type] || '#22d3ee';
  const s = Math.max(28, objScale * 62);
  ctx.save(); ctx.translate(ox, oy);
  ctx.strokeStyle = color; ctx.fillStyle = ha(color, isGrabbed ? 0.30 : 0.16);
  ctx.lineWidth = isGrabbed ? 3.5 : 2.5; ctx.shadowColor = color; ctx.shadowBlur = isGrabbed ? 36 : 16;
  if (isGrabbed) {
    ctx.beginPath(); ctx.arc(0,0,s*1.18,0,Math.PI*2);
    ctx.strokeStyle = ha(color,0.28); ctx.lineWidth=8; ctx.setLineDash([10,7]); ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle=color; ctx.lineWidth=3.5;
  }
  if (type==='caja') { const d=s*0.4; ctx.fillRect(-s/2,-s/2,s,s); ctx.strokeRect(-s/2,-s/2,s,s); ctx.beginPath(); ctx.moveTo(-s/2,-s/2); ctx.lineTo(-s/2+d,-s/2-d*0.65); ctx.moveTo(s/2,-s/2); ctx.lineTo(s/2+d,-s/2-d*0.65); ctx.moveTo(s/2,s/2); ctx.lineTo(s/2+d,s/2-d*0.65); ctx.moveTo(-s/2+d,-s/2-d*0.65); ctx.lineTo(s/2+d,-s/2-d*0.65); ctx.moveTo(s/2+d,-s/2-d*0.65); ctx.lineTo(s/2+d,s/2-d*0.65); ctx.stroke(); }
  else if (type==='herramienta') { ctx.beginPath(); ctx.roundRect(-7,-s,14,s*2,3); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0,-s,20,11,0,0,Math.PI*2); ctx.fill(); ctx.stroke(); }
  else if (type==='martillo') { ctx.fillRect(-6,0,12,s*1.3); ctx.strokeRect(-6,0,12,s*1.3); ctx.fillRect(-s*0.55,-s*0.55,s*1.1,s*0.6); ctx.strokeRect(-s*0.55,-s*0.55,s*1.1,s*0.6); }
  else if (type==='tornillo') { ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(0,s*0.8); ctx.stroke(); for(let i=0;i<7;i++){const y=-s+i*(s*1.8/6); ctx.beginPath(); ctx.moveTo(-11,y); ctx.lineTo(11,y+s*0.14); ctx.stroke();} ctx.fillRect(-14,-s,28,14); ctx.strokeRect(-14,-s,28,14); }
  else if (type==='destornillador') { ctx.beginPath(); ctx.moveTo(-3,-s*1.1); ctx.lineTo(3,-s*1.1); ctx.lineTo(1.5,s*0.7); ctx.lineTo(-1.5,s*0.7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0,-s*0.45,12,s*0.38,0,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillRect(-4,s*0.7,8,s*0.5); ctx.strokeRect(-4,s*0.7,8,s*0.5); }
  else if (type==='componente') { ctx.fillRect(-s*0.9,-s*0.5,s*1.8,s); ctx.strokeRect(-s*0.9,-s*0.5,s*1.8,s); for(let i=0;i<6;i++){ctx.beginPath();ctx.arc(-s*0.7+i*s*0.28,-s*0.5,4,0,Math.PI*2);ctx.fill();} ctx.strokeStyle=ha(color,0.5);ctx.lineWidth=1; for(let i=0;i<3;i++)ctx.strokeRect(-s*0.7+i*s*0.44,-s*0.25,s*0.36,s*0.5); }
  else if (type==='pantalla') { const sw=s*1.65;const sh=s; ctx.fillRect(-sw/2,-sh/2,sw,sh);ctx.strokeRect(-sw/2,-sh/2,sw,sh); ctx.strokeStyle=ha(color,0.45);ctx.strokeRect(-sw/2+5,-sh/2+5,sw-10,sh-10); ctx.fillStyle=ha(color,0.08);ctx.fillRect(-sw/2+8,-sh/2+8,sw-16,sh-16); }
  else if (type==='boton') { ctx.beginPath();ctx.ellipse(0,0,s*0.62,s*0.36,0,0,Math.PI*2);ctx.fill();ctx.stroke(); ctx.shadowBlur=22;ctx.beginPath();ctx.ellipse(0,-4,s*0.42,s*0.23,0,0,Math.PI*2);ctx.fill();ctx.stroke(); }
  else if (type==='engranaje') { const teeth=10;const r1=s*0.52;const r2=s*0.72; ctx.beginPath(); for(let i=0;i<teeth*2;i++){const a=(i/(teeth*2))*Math.PI*2;const r=i%2===0?r2:r1; i===0?ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r):ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);} ctx.closePath();ctx.fill();ctx.stroke(); ctx.beginPath();ctx.arc(0,0,s*0.2,0,Math.PI*2); ctx.fillStyle='#0a0a1a';ctx.fill();ctx.strokeStyle=color;ctx.stroke(); }
  else if (type==='palanca') { ctx.fillRect(-8,-s*0.12,s*1.4,18);ctx.strokeRect(-8,-s*0.12,s*1.4,18); ctx.fillRect(-8,-s,16,s*0.92);ctx.strokeRect(-8,-s,16,s*0.92); ctx.beginPath();ctx.arc(0,-s,19,0,Math.PI*2);ctx.fill();ctx.stroke(); }
  else if (type==='pcb') { const pw=s*1.6;const ph=s*1.1; ctx.fillStyle='#0d4f3c';ctx.fillRect(-pw/2,-ph/2,pw,ph); ctx.strokeStyle=color;ctx.strokeRect(-pw/2,-ph/2,pw,ph); ctx.lineWidth=1;ctx.strokeStyle=ha(color,0.6); for(let r=0;r<3;r++)for(let c=0;c<4;c++){ctx.beginPath();ctx.arc(-pw/2+s*0.28+c*s*0.36,-ph/2+s*0.28+r*s*0.24,4,0,Math.PI*2);ctx.stroke();} ctx.beginPath();ctx.moveTo(-pw/2+10,-ph/4);ctx.lineTo(0,-ph/4);ctx.lineTo(0,0);ctx.lineTo(pw/2-10,0);ctx.stroke(); }
  ctx.shadowBlur=0; ctx.fillStyle=color; ctx.font=`bold ${Math.round(s*0.22)}px Arial`; ctx.textAlign='center';ctx.textBaseline='alphabetic';
  const lbl=isGrabbed?`✊ ${type.toUpperCase()}`:type.toUpperCase();
  ctx.shadowColor=color;ctx.shadowBlur=isGrabbed?12:4; ctx.fillText(lbl,0,s*1.55+10); ctx.shadowBlur=0; ctx.restore();
}

// ── Velocity → color (azul=lento → cian → verde → amarillo → rojo=rápido) ────
function velColor(v: number): string {
  const t = Math.min(1, v / 0.028);
  if (t < 0.25) { const k=t*4; return `rgb(${Math.round(56+k*0)},${Math.round(189-k*89)},248)`; }        // blue→cyan
  if (t < 0.5)  { const k=(t-0.25)*4; return `rgb(${Math.round(56+k*107)},${Math.round(100+k*130)},${Math.round(248-k*248)})`; } // cyan→green
  if (t < 0.75) { const k=(t-0.5)*4;  return `rgb(${Math.round(163+k*88)},${Math.round(230-k*39)},36)`; } // green→yellow
  const k=(t-0.75)*4; return `rgb(${Math.round(251-k*7)},${Math.round(191-k*128)},${Math.round(36+k*58)})`; // yellow→red
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Particle { x:number; y:number; vx:number; vy:number; life:number; color:string; }

interface ActionEvent {
  type: 'pickup' | 'release';
  side: 'L' | 'R';
  label: string;
  emoji: string;
  color: string;
  startTime: number;
}

interface LiveData {
  emotionLevel:     EmotionLevel | null;
  emotionScore:     number;
  posture:          PostureScore | null;
  therbligL:        TherbligType | null;
  therbligR:        TherbligType | null;
  efficiencyPct:    number;
  isDrowsy:         boolean;
  therbligHistory:  TherbligEvent[];
}

interface GestureInfo { type: GestureType; score: number; }

interface Props {
  isActive:      boolean;
  onResults:     (r: VisionResults) => void;
  showSkeleton:  boolean;
  virtualObject: VirtualObjectType;
  onFps?:        (fps: number) => void;
  liveData?:     LiveData;
}

// ── Component ─────────────────────────────────────────────────────────────────
const CameraFeed: React.FC<Props> = ({ isActive, onResults, showSkeleton, virtualObject, onFps, liveData }) => {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Model instances
  const gestureRef = useRef<GRType | null>(null);
  const poseRef    = useRef<PLType | null>(null);
  const faceRef    = useRef<FLType | null>(null);
  const objDetRef  = useRef<ODType | null>(null);

  // Drawing state
  const rafRef          = useRef<number>(0);
  const leftTrailRef    = useRef<{x:number;y:number}[]>([]);
  const rightTrailRef   = useRef<{x:number;y:number}[]>([]);
  const particlesRef    = useRef<Particle[]>([]);
  const leftOpenRef     = useRef(0.5);
  const rightOpenRef    = useRef(0.5);
  const prevEffRef      = useRef(0);
  const achieveRef      = useRef(0);
  const lastBeepRef     = useRef(0);
  const drowsyFramesRef = useRef(0);
  const fpsCountRef     = useRef(0);
  const lastFpsTimeRef  = useRef(Date.now());
  const liveDataRef     = useRef<LiveData | undefined>(liveData);

  // Gesture display (latest, for HUD)
  const leftGestureRef  = useRef<GestureInfo | null>(null);
  const rightGestureRef = useRef<GestureInfo | null>(null);

  // Virtual object physics
  const objPosRef          = useRef({ x:320, y:200 });
  const objVelRef          = useRef({ x:2.5, y:0 });
  const objGrabbedRef      = useRef(false);
  const throwVelRef        = useRef({ x:0, y:0 });
  const objScaleRef        = useRef(1.0);
  const objInitRef         = useRef(false);
  const prevTwoHandDistRef = useRef(0);

  // Therblig flash
  const prevTherbligRef  = useRef<string|null>(null);
  const therbligFlashRef = useRef(0);

  // Frame-skip counter for heavier models
  const frameCountRef  = useRef(0);
  const lastPoseRef    = useRef<any>(null);
  const lastFaceRef    = useRef<any>(null);
  const lastObjRef     = useRef<DetectedObject[]>([]);
  const lastLeftObjRef = useRef<DetectedObject | null>(null);
  const lastRightObjRef= useRef<DetectedObject | null>(null);

  // Heatmap buffers (64×48 mirrored grid, both hands)
  const HEAT_W = 64; const HEAT_H = 48;
  const heatBufRef   = useRef(new Float32Array(64 * 48));
  const heatMaxRef   = useRef(0);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Pick/Release action events
  const actionEventsRef = useRef<ActionEvent[]>([]);
  const prevLObjKeyRef  = useRef<string | null>(null);
  const prevRObjKeyRef  = useRef<string | null>(null);

  // Velocity trail (store {x,y,vel} per point)
  const leftVTrailRef  = useRef<{x:number;y:number;vel:number}[]>([]);
  const rightVTrailRef = useRef<{x:number;y:number;vel:number}[]>([]);

  const [status,      setStatus]      = useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [loadStage,   setLoadStage]   = useState('');
  const [errorMsg,    setErrorMsg]    = useState('');

  useEffect(() => { liveDataRef.current = liveData; }, [liveData]);

  useEffect(() => {
    objInitRef.current = false; objVelRef.current = {x:2.5,y:0};
    objGrabbedRef.current = false; objScaleRef.current = 1.0; prevTwoHandDistRef.current = 0;
  }, [virtualObject]);

  // ── HUD drawing function ───────────────────────────────────────────────────
  const drawHUD = useCallback((
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    ld: LiveData | undefined,
    lGes: GestureInfo | null,
    rGes: GestureInfo | null,
    _lObj: DetectedObject | null,   // kept for future per-hand floating labels
    _rObj: DetectedObject | null,
  ) => {
    const pad = 12;
    const R   = 9;

    function pill(x:number, y:number, text:string, color:string, align:'l'|'r'='l', height=26) {
      ctx.font = 'bold 13px Arial';
      const tw = ctx.measureText(text).width; const bw = tw+22; const bh = height;
      const bx = align==='r' ? x-bw : x;
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.roundRect(bx,y,bw,bh,R); ctx.fill();
      ctx.strokeStyle=ha(color,0.50); ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle=color; ctx.shadowColor=color; ctx.shadowBlur=8;
      ctx.textAlign=align==='r'?'right':'left'; ctx.textBaseline='middle';
      ctx.fillText(text, align==='r'?bx+bw-11:bx+11, y+bh/2);
      ctx.shadowBlur=0; ctx.textAlign='left';
    }

    // Emotion top-left
    if (ld?.emotionLevel) {
      const ei = EMOTION_INFO[ld.emotionLevel];
      pill(pad, pad, `${ei.emoji} ${ei.label}  ${ld.emotionScore}%`, ei.color, 'l');
    }
    // RULA top-right
    if (ld?.posture) {
      const rc = ld.posture.risk==='low'?'#22d3ee':ld.posture.risk==='medium'?'#a3e635':ld.posture.risk==='high'?'#fb923c':'#f43f5e';
      pill(w-pad, pad, `RULA ${ld.posture.rula} · ${ld.posture.risk.toUpperCase()}`, rc, 'r');
    }

    // ── Therblig centre (siempre visible mientras haya therblig) ──────────────
    const activeT = ld?.therbligR || ld?.therbligL;
    if (activeT !== prevTherbligRef.current) {
      prevTherbligRef.current = activeT ?? null;
      therbligFlashRef.current = 60;
    }
    if (therbligFlashRef.current > 0) therbligFlashRef.current--;

    if (activeT) {
      const ti = THERBLIG_INFO[activeT];
      if (ti) {
        const flash = therbligFlashRef.current / 60;
        const pulse = 0.88 + 0.12 * Math.sin(Date.now() * 0.004) + flash * 0.15;
        const actionText = `${activeT}  ·  ${ti.label}`;
        const effBadge   = ti.efficient ? '✅ EFICIENTE' : '⚠️ INEFICIENTE';
        const effColor   = ti.efficient ? '#4ade80' : '#f87171';

        ctx.font = 'bold 18px Arial';
        const tw = ctx.measureText(actionText).width;
        const bw = Math.max(tw+48, 240); const bh = 54;
        const bx = (w-bw)/2; const by = pad+36;

        ctx.globalAlpha = Math.min(1, pulse);
        ctx.shadowColor = ti.color; ctx.shadowBlur = 22+flash*18;
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,14); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = ha(ti.color, 0.80+flash*0.20); ctx.lineWidth=2; ctx.stroke();

        // Therblig code + label (line 1)
        ctx.fillStyle = ti.color; ctx.shadowColor = ti.color; ctx.shadowBlur = 16;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(actionText, w/2, by+17);
        ctx.shadowBlur = 0;

        // Efficient badge (line 2)
        ctx.font = 'bold 11px Arial';
        ctx.fillStyle = effColor; ctx.shadowColor = effColor; ctx.shadowBlur = 8;
        ctx.fillText(effBadge, w/2, by+36);
        ctx.shadowBlur = 0;

        // Desc (small, below badge)
        ctx.font = '10px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(ti.desc, w/2, by+50);

        ctx.globalAlpha = 1;
      }
    }

    // ── Per-hand therblig + gesture + object etiquetas (bottom panels) ─────
    const bY = h - pad - 30;

    function handPanel(
      side: 'l' | 'r',
      therbligT: TherbligType | null | undefined,
      ges: GestureInfo | null,
      objInHand: DetectedObject | null,
    ) {
      const isLeft = side === 'l';
      const x0 = isLeft ? pad : w - pad;
      const align = isLeft ? 'l' as const : 'r' as const;

      // Object etiqueta (topmost)
      let objY = bY - 72;
      if (objInHand) {
        pill(x0, objY, `${objInHand.emoji} ${objInHand.labelEs}  ${objInHand.score}%`, objInHand.color, align);
        objY -= 34;
      }

      // Gesture etiqueta
      if (ges && ges.type !== 'None' && ges.type !== 'Unknown') {
        const gd = GESTURE_DISPLAY[ges.type];
        if (gd) pill(x0, bY - 36, `${gd.emoji} ${gd.label}  ${ges.score}%`, gd.color, align);
      }

      // Therblig etiqueta (bottom)
      if (therbligT) {
        const ti = THERBLIG_INFO[therbligT];
        if (ti) {
          const badge = ti.efficient ? '✅' : '⚠️';
          const arrow = isLeft ? '←' : '→';
          pill(x0, bY, `${arrow} ${therbligT} · ${ti.label}  ${badge}`, ti.color, align, 30);
        }
      }
    }

    handPanel('l', ld?.therbligL, lGes, lastLeftObjRef.current);
    handPanel('r', ld?.therbligR, rGes, lastRightObjRef.current);

    // Efficiency ring centre bottom
    if (ld && ld.efficiencyPct > 0) {
      const cx = w/2; const cy = h - pad - 16;
      const ec = ld.efficiencyPct>=70?'#22d3ee':ld.efficiencyPct>=45?'#fbbf24':'#f43f5e';
      ctx.beginPath(); ctx.arc(cx,cy,20,0,Math.PI*2); ctx.fillStyle='rgba(0,0,0,0.60)'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx,cy,20,-Math.PI/2,-Math.PI/2+Math.PI*2*(ld.efficiencyPct/100));
      ctx.strokeStyle=ec; ctx.lineWidth=4; ctx.shadowColor=ec; ctx.shadowBlur=10; ctx.stroke(); ctx.shadowBlur=0;
      ctx.fillStyle=ec; ctx.font='bold 10px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(`${ld.efficiencyPct}%`, cx, cy);
    }

    // Timeline bar
    if (ld?.therbligHistory?.length) {
      const tlH=5; const tlY=h-tlH;
      ctx.fillStyle='rgba(0,0,0,0.38)'; ctx.fillRect(0,tlY,w,tlH);
      const winMs=30000; const now2=Date.now();
      ld.therbligHistory.slice(-80).forEach(e=>{
        if(now2-e.startTime>winMs) return;
        const xS=((e.startTime-(now2-winMs))/winMs)*w;
        const xE=Math.min(w,((e.startTime+e.duration-(now2-winMs))/winMs)*w);
        const ti=THERBLIG_INFO[e.type]; if(!ti||xE<=xS) return;
        ctx.fillStyle=ti.color; ctx.fillRect(xS,tlY,Math.max(2,xE-xS),tlH);
      });
    }

    // Achievement flash
    if (ld && prevEffRef.current < 80 && ld.efficiencyPct >= 80) achieveRef.current = 90;
    if (ld) prevEffRef.current = ld.efficiencyPct;
    if (achieveRef.current > 0) {
      const alpha = Math.min(1, achieveRef.current/25);
      ctx.globalAlpha = alpha;
      ctx.font='bold 28px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowColor='#22d3ee'; ctx.shadowBlur=18; ctx.fillStyle='#22d3ee';
      ctx.fillText('⚡ EFICIENCIA ALTA', w/2, h/2-18);
      ctx.font='15px Arial'; ctx.fillStyle='rgba(255,255,255,0.75)';
      ctx.fillText(`${ld?.efficiencyPct||''}% eficiente`, w/2, h/2+14);
      ctx.shadowBlur=0; ctx.globalAlpha=1; achieveRef.current--;
    }

    // Drowsiness alarm
    const drowsy = ld?.isDrowsy||false;
    if (drowsy) {
      drowsyFramesRef.current++;
      if (drowsyFramesRef.current > 30) {
        const pulse = 0.28+0.15*Math.sin(Date.now()*0.008);
        ctx.fillStyle=`rgba(244,63,94,${pulse})`; ctx.fillRect(0,0,w,h);
        ctx.strokeStyle='#f43f5e'; ctx.lineWidth=5; ctx.strokeRect(3,3,w-6,h-6);
        ctx.font='bold 22px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillStyle='#fff'; ctx.shadowColor='#f43f5e'; ctx.shadowBlur=14;
        ctx.fillText('⚠️  SOMNOLENCIA DETECTADA  ⚠️', w/2, h/2);
        ctx.shadowBlur=0;
        if (Date.now()-lastBeepRef.current>3000) { playBeep(); lastBeepRef.current=Date.now(); }
      }
    } else { drowsyFramesRef.current=0; }

    // Virtual object hint
    if (virtualObject !== 'none' && !objGrabbedRef.current) {
      ctx.font='11px Arial'; ctx.textAlign='right'; ctx.textBaseline='bottom';
      ctx.fillStyle='rgba(255,255,255,0.28)';
      ctx.fillText('✊ puño = agarrar  ·  👐 dos manos = escalar', w-pad, h-8);
    }
  }, [virtualObject]);

  // ── Main frame loop ───────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    objInitRef.current = false; objVelRef.current = {x:2.5,y:0};
    objGrabbedRef.current = false; objScaleRef.current = 1.0;

    const loop = async () => {
      const canvas = canvasRef.current;
      const video  = videoRef.current;
      if (!canvas || !video || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop); return;
      }

      const W = video.videoWidth||640;
      const H = video.videoHeight||480;
      if (canvas.width!==W||canvas.height!==H) { canvas.width=W; canvas.height=H; }

      const ctx = canvas.getContext('2d', {alpha:true})!;
      ctx.clearRect(0,0,W,H);

      const now = performance.now();
      frameCountRef.current++;

      // ── Inference ────────────────────────────────────────────────────────
      // Gesture every frame · Pose every 2 · Face every 3 · Objects every 5
      let gestureResult: any = null;
      let poseResult:    any = lastPoseRef.current;
      let faceResult:    any = lastFaceRef.current;

      try {
        if (gestureRef.current) gestureResult = gestureRef.current.recognizeForVideo(video, now);
      } catch {}
      if (frameCountRef.current % 2 === 0) {
        try { if (poseRef.current) { poseResult = poseRef.current.detectForVideo(video, now); lastPoseRef.current = poseResult; } } catch {}
      }
      if (frameCountRef.current % 3 === 0) {
        try { if (faceRef.current) { faceResult = faceRef.current.detectForVideo(video, now); lastFaceRef.current = faceResult; } } catch {}
      }
      if (frameCountRef.current % 5 === 0 && objDetRef.current) {
        try {
          const objRes = objDetRef.current.detectForVideo(video, now);
          const allDets: DetectedObject[] = (objRes.detections || [])
            .filter((d: any) => d.categories?.[0]?.categoryName !== 'person' && (d.categories?.[0]?.score || 0) >= 0.35)
            .map((d: any) => {
              const cat = d.categories[0].categoryName as string;
              const meta = getObjMeta(cat);
              return {
                label: cat, labelEs: meta.es, emoji: meta.emoji, color: meta.color,
                score: Math.round(d.categories[0].score * 100),
                boundingBox: d.boundingBox,
              } as DetectedObject;
            });
          lastObjRef.current = allDets;
        } catch {}
      }

      // ── Parse hand results ────────────────────────────────────────────────
      let leftLM:  any = null;
      let rightLM: any = null;
      let lGes: GestureInfo | null = null;
      let rGes: GestureInfo | null = null;
      let lState: HandState | null = null;
      let rState: HandState | null = null;

      if (gestureResult) {
        for (let i=0; i<(gestureResult.handedness?.length||0); i++) {
          const handedness = gestureResult.handedness[i]?.[0]?.categoryName as string;
          const lm         = gestureResult.landmarks?.[i];
          const g          = gestureResult.gestures?.[i]?.[0];
          const gType      = (g?.categoryName || 'None') as GestureType;
          const gScore     = g?.score || 0;

          const info: GestureInfo = { type: gType, score: Math.round(gScore*100) };

          // Tasks Vision 'Left' = person's left (verified empirically); if swapped, flip here
          if (handedness === 'Left') {
            leftLM = lm; lGes = info;
            lState = lm ? classifyHandState(lm, gType, gScore) : null;
          } else {
            rightLM = lm; rGes = info;
            rState = lm ? classifyHandState(lm, gType, gScore) : null;
          }
        }
      }

      leftGestureRef.current  = lGes;
      rightGestureRef.current = rGes;

      const poseLM  = poseResult?.landmarks?.[0] || null;
      const faceLM  = faceResult?.faceLandmarks?.[0] || null;
      const blends: BlendshapeCategory[] | null = faceResult?.faceBlendshapes?.[0]?.categories || null;

      // Find objects near each hand
      const allDets = lastObjRef.current;
      const lObjInHand = leftLM  ? findObjectNearHand(leftLM,  allDets, W, H) : null;
      const rObjInHand = rightLM ? findObjectNearHand(rightLM, allDets, W, H) : null;
      lastLeftObjRef.current  = lObjInHand;
      lastRightObjRef.current = rObjInHand;

      // Send to parent
      onResults({
        poseLandmarks:      poseLM,
        leftHandLandmarks:  leftLM,
        rightHandLandmarks: rightLM,
        faceLandmarks:      faceLM,
        leftGesture:        lGes?.type || null,
        rightGesture:       rGes?.type || null,
        leftGestureScore:   lGes?.score || 0,
        rightGestureScore:  rGes?.score || 0,
        leftHandState:      lState,
        rightHandState:     rState,
        faceBlendshapes:    blends,
        leftObjectInHand:   lObjInHand,
        rightObjectInHand:  rObjInHand,
        allDetections:      allDets,
      });

      // ── Update velocity trails + heatmap + pick/release events ────────────
      function updateVTrail(
        lm: any,
        vTrailRef: React.MutableRefObject<{x:number;y:number;vel:number}[]>,
        openRef: React.MutableRefObject<number>,
        pColor: string,
      ) {
        if (!lm) { vTrailRef.current=[]; return; }
        const wx=lm[0].x; const wy=lm[0].y;
        const tr=vTrailRef.current;
        const prev=tr.length>0?tr[tr.length-1]:null;
        const vel=prev?Math.hypot(wx-prev.x,wy-prev.y):0;
        if(!tr.length||vel>0.003) {
          tr.push({x:wx,y:wy,vel}); if(tr.length>MAX_TRAIL) tr.shift();
        }
        const spread=lm[8]&&lm[20]?Math.hypot(lm[8].x-lm[20].x,lm[8].y-lm[20].y)*4.5:0.5;
        openRef.current=Math.max(0,Math.min(1,spread));
        if(vel>0.018) {
          const px=wx*W; const py=wy*H;
          const vCol=velColor(vel);
          for(let i=0;i<5;i++){const a=Math.random()*Math.PI*2;const sp=2+Math.random()*5; particlesRef.current.push({x:px,y:py,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,color:vCol});}
          if(particlesRef.current.length>MAX_PARTICLES) particlesRef.current=particlesRef.current.slice(-MAX_PARTICLES);
        }
        // Heatmap accumulation (mirrored x → matches what user sees)
        const mx=Math.floor((1-wx)*HEAT_W); const my=Math.floor(wy*HEAT_H);
        if(mx>=0&&mx<HEAT_W&&my>=0&&my<HEAT_H) {
          const idx=my*HEAT_W+mx;
          heatBufRef.current[idx]+=1;
          if(heatBufRef.current[idx]>heatMaxRef.current) heatMaxRef.current=heatBufRef.current[idx];
        }
      }
      updateVTrail(leftLM,  leftVTrailRef,  leftOpenRef,  '#818cf8');
      updateVTrail(rightLM, rightVTrailRef, rightOpenRef, '#f43f5e');

      // ── Pick / Release event detection ────────────────────────────────────
      const now2 = Date.now();
      function checkPickRelease(
        lm: any,
        objInHand: DetectedObject | null,
        prevKeyRef: React.MutableRefObject<string|null>,
        side: 'L'|'R',
        gesType: GestureType | undefined,
      ) {
        const key = objInHand?.label ?? null;
        const prev = prevKeyRef.current;
        if (!prev && key && (gesType==='Closed_Fist'||lm)) {
          // Pickup detected
          actionEventsRef.current.push({
            type:'pickup', side, label:objInHand!.labelEs,
            emoji:objInHand!.emoji, color:objInHand!.color, startTime:now2,
          });
          playBeep(880, 0.12);
        } else if (prev && !key) {
          // Release detected
          const prevDet = side==='L'?lastLeftObjRef.current:lastRightObjRef.current;
          actionEventsRef.current.push({
            type:'release', side, label:prevDet?.labelEs??prev,
            emoji:prevDet?.emoji??'📦', color:prevDet?.color??'#f43f5e', startTime:now2,
          });
          playBeep(440, 0.12);
        }
        prevKeyRef.current = key;
      }
      checkPickRelease(leftLM,  lObjInHand, prevLObjKeyRef, 'L', lGes?.type);
      checkPickRelease(rightLM, rObjInHand, prevRObjKeyRef, 'R', rGes?.type);
      // Purge old events (>2.5 s)
      actionEventsRef.current = actionEventsRef.current.filter(e=>now2-e.startTime<2500);

      // Two-hand scale
      if (virtualObject!=='none' && leftLM && rightLM) {
        const dist=Math.hypot(leftLM[0].x-rightLM[0].x,leftLM[0].y-rightLM[0].y);
        if(prevTwoHandDistRef.current>0.01&&dist>0.01) {
          const ratio=dist/prevTwoHandDistRef.current;
          objScaleRef.current=Math.max(0.28,Math.min(3.2,objScaleRef.current*ratio));
        }
        prevTwoHandDistRef.current=dist;
      } else { prevTwoHandDistRef.current=0; }

      // ── Virtual object physics ────────────────────────────────────────────
      if (virtualObject!=='none') {
        const hand = rightLM||leftLM;
        // Use gesture for grab detection (Closed_Fist or low openness)
        const rGesType = rGes?.type||'None';
        const lGesType = lGes?.type||'None';
        const isGrabGesture = rGesType==='Closed_Fist'||lGesType==='Closed_Fist';
        const openness = rightOpenRef.current||leftOpenRef.current;
        const isGrabbed = (isGrabGesture || openness < 0.30) && !!hand;

        if (!objInitRef.current) { objPosRef.current={x:W*0.5,y:H*0.28}; objInitRef.current=true; }

        if (isGrabbed && hand) {
          const tx=hand[0].x*W; const ty=hand[0].y*H;
          throwVelRef.current={x:(tx-objPosRef.current.x)*0.55,y:(ty-objPosRef.current.y)*0.55};
          objPosRef.current.x+=(tx-objPosRef.current.x)*0.38;
          objPosRef.current.y+=(ty-objPosRef.current.y)*0.38;
          objGrabbedRef.current=true;
        } else {
          if(objGrabbedRef.current){objVelRef.current={x:throwVelRef.current.x*4.5,y:throwVelRef.current.y*4.5};objGrabbedRef.current=false;}
          const GRAVITY=0.38;const BOUNCE=0.60;const FRICTION=0.987;
          objVelRef.current.y+=GRAVITY; objVelRef.current.x*=FRICTION;
          objPosRef.current.x+=objVelRef.current.x; objPosRef.current.y+=objVelRef.current.y;
          const m=52;
          if(objPosRef.current.x<m){objPosRef.current.x=m;objVelRef.current.x=Math.abs(objVelRef.current.x)*BOUNCE;}
          if(objPosRef.current.x>W-m){objPosRef.current.x=W-m;objVelRef.current.x=-Math.abs(objVelRef.current.x)*BOUNCE;}
          if(objPosRef.current.y<m){objPosRef.current.y=m;objVelRef.current.y=Math.abs(objVelRef.current.y)*BOUNCE;}
          if(objPosRef.current.y>H-m){objPosRef.current.y=H-m;objVelRef.current.y=-Math.abs(objVelRef.current.y)*BOUNCE;if(Math.abs(objVelRef.current.y)<0.5)objVelRef.current.y=0;}
        }
      }

      // ── Vignette ─────────────────────────────────────────────────────────
      const vig=ctx.createRadialGradient(W/2,H/2,H*0.22,W/2,H/2,H*0.82);
      vig.addColorStop(0,'transparent'); vig.addColorStop(1,'rgba(0,0,0,0.44)');
      ctx.fillStyle=vig; ctx.fillRect(0,0,W,H);

      // ── Mirror transform for skeleton + trails + particles + virtual object ──
      ctx.save();
      ctx.translate(W,0); ctx.scale(-1,1);

      // Skeleton (tasks-vision DrawingUtils)
      if (showSkeleton) {
        const tv = _tv;
        if (tv && tv.DrawingUtils) {
          const du = new tv.DrawingUtils(ctx);
          const ld2 = liveDataRef.current;
          const rulaColor = !ld2?.posture?'#22d3ee':ld2.posture.risk==='low'?'#22d3ee':ld2.posture.risk==='medium'?'#a3e635':ld2.posture.risk==='high'?'#fb923c':'#f43f5e';

          if (poseLM) {
            ctx.shadowColor=rulaColor; ctx.shadowBlur=7;
            du.drawConnectors(poseLM, tv.PoseLandmarker.POSE_CONNECTIONS, {color:ha(rulaColor,0.35), lineWidth:2.5});
            du.drawLandmarks(poseLM, {color:rulaColor, lineWidth:1, radius:3});
            ctx.shadowBlur=0;
          }
          if (faceLM) {
            ctx.shadowColor='#22d3ee'; ctx.shadowBlur=4;
            du.drawConnectors(faceLM, tv.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, {color:'#22d3ee1a', lineWidth:1});
            du.drawConnectors(faceLM, tv.FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,  {color:'#22d3ee99', lineWidth:1.5});
            du.drawConnectors(faceLM, tv.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, {color:'#22d3ee99', lineWidth:1.5});
            du.drawConnectors(faceLM, tv.FaceLandmarker.FACE_LANDMARKS_LIPS,       {color:'#f43f5e88', lineWidth:1.5});
            ctx.shadowBlur=0;
          }
          if (leftLM) {
            ctx.shadowColor='#818cf8'; ctx.shadowBlur=10;
            du.drawConnectors(leftLM,  tv.GestureRecognizer.HAND_CONNECTIONS, {color:'#818cf8cc', lineWidth:2.5});
            du.drawLandmarks(leftLM,   {color:'#c4b5fd', lineWidth:1, radius:4.5});
            ctx.shadowBlur=0;
          }
          if (rightLM) {
            ctx.shadowColor='#f43f5e'; ctx.shadowBlur=10;
            du.drawConnectors(rightLM, tv.GestureRecognizer.HAND_CONNECTIONS, {color:'#f43f5ecc', lineWidth:2.5});
            du.drawLandmarks(rightLM,  {color:'#fda4af', lineWidth:1, radius:4.5});
            ctx.shadowBlur=0;
          }
        }
      }

      // ── Therblig visual overlays ON the hands (mirror space) ──────────────
      {
        const ld3 = liveDataRef.current;
        const pulse = 0.82 + 0.18 * Math.sin(Date.now() * 0.006);

        function drawHandTherblig(
          lm: any,
          therbligT: TherbligType | null | undefined,
          vTrail: {x:number;y:number;vel:number}[],
        ) {
          if (!lm || !therbligT) return;
          const ti = THERBLIG_INFO[therbligT];
          if (!ti) return;

          const wx = lm[0].x * W;
          const wy = lm[0].y * H;

          // ── Aura ring around wrist ──────────────────────────────────────
          const auraR   = ti.efficient ? 28 : 32;
          const auraPulse = ti.efficient ? pulse : 0.9 + 0.1 * Math.sin(Date.now() * 0.012);
          ctx.beginPath();
          ctx.arc(wx, wy, auraR * auraPulse, 0, Math.PI * 2);
          ctx.strokeStyle = ha(ti.color, 0.55);
          ctx.lineWidth   = ti.efficient ? 2.5 : 3.5;
          ctx.shadowColor = ti.color;
          ctx.shadowBlur  = 18;
          ctx.stroke();
          ctx.shadowBlur  = 0;

          // Outer ring (inefficient = dashed warning)
          if (!ti.efficient) {
            ctx.beginPath();
            ctx.arc(wx, wy, (auraR + 10) * auraPulse, 0, Math.PI * 2);
            ctx.strokeStyle = ha(ti.color, 0.25);
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([6, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // ── Floating badge above wrist ──────────────────────────────────
          const badgeText = `${therbligT}`;
          const descText  = ti.label;
          ctx.font = 'bold 13px Arial';
          const bw1 = ctx.measureText(badgeText).width;
          ctx.font = '10px Arial';
          const bw2 = ctx.measureText(descText).width;
          const bw  = Math.max(bw1, bw2) + 20;
          const bh  = 42;
          const bx  = wx - bw / 2;
          const by  = wy - auraR - bh - 12;

          ctx.fillStyle = 'rgba(0,0,0,0.78)';
          ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill();
          ctx.strokeStyle = ha(ti.color, 0.80); ctx.lineWidth = 1.5;
          ctx.shadowColor = ti.color; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;

          // Code
          ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = ti.color; ctx.shadowColor = ti.color; ctx.shadowBlur = 8;
          ctx.fillText(badgeText, wx, by + 14); ctx.shadowBlur = 0;

          // Label
          ctx.font = '10px Arial'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillText(descText, wx, by + 30);

          // Efficient dot
          const dotColor = ti.efficient ? '#4ade80' : '#fb7185';
          const dotText  = ti.efficient ? '●' : '▲';
          ctx.font = 'bold 10px Arial';
          ctx.fillStyle = dotColor; ctx.shadowColor = dotColor; ctx.shadowBlur = 6;
          ctx.fillText(dotText, wx + bw/2 - 9, by + 9); ctx.shadowBlur = 0;

          // ── Motion arrow for transport therbligs ────────────────────────
          if ((therbligT === 'TL' || therbligT === 'TE' || therbligT === 'P') && vTrail.length >= 3) {
            const tail = vTrail[vTrail.length - 3];
            const head = vTrail[vTrail.length - 1];
            const dx   = (head.x - tail.x) * W;
            const dy   = (head.y - tail.y) * H;
            const len  = Math.hypot(dx, dy);
            if (len > 4) {
              const scale = Math.min(60, len * 3.5);
              const nx = dx / len; const ny = dy / len;
              const arrowX = wx + nx * (auraR + 4);
              const arrowY = wy + ny * (auraR + 4);
              const tipX   = arrowX + nx * scale;
              const tipY   = arrowY + ny * scale;
              // Shaft
              ctx.beginPath(); ctx.moveTo(arrowX, arrowY); ctx.lineTo(tipX, tipY);
              ctx.strokeStyle = ha(ti.color, 0.90); ctx.lineWidth = 3;
              ctx.shadowColor = ti.color; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
              // Arrowhead
              const angle = Math.atan2(ny, nx);
              const hs = 10;
              ctx.beginPath();
              ctx.moveTo(tipX, tipY);
              ctx.lineTo(tipX - hs*Math.cos(angle-0.45), tipY - hs*Math.sin(angle-0.45));
              ctx.lineTo(tipX - hs*Math.cos(angle+0.45), tipY - hs*Math.sin(angle+0.45));
              ctx.closePath();
              ctx.fillStyle = ha(ti.color, 0.90); ctx.shadowColor = ti.color; ctx.shadowBlur = 8;
              ctx.fill(); ctx.shadowBlur = 0;
            }
          }

          // ── Palm fill for Grasp / Hold / Assemble ──────────────────────
          if (therbligT === 'G' || therbligT === 'H' || therbligT === 'A') {
            ctx.beginPath(); ctx.arc(wx, wy, 14, 0, Math.PI * 2);
            ctx.fillStyle = ha(ti.color, 0.22 * auraPulse);
            ctx.shadowColor = ti.color; ctx.shadowBlur = 16;
            ctx.fill(); ctx.shadowBlur = 0;
          }

          // ── Connector line from badge to wrist ─────────────────────────
          ctx.beginPath();
          ctx.moveTo(wx, by + bh);
          ctx.lineTo(wx, wy - auraR);
          ctx.strokeStyle = ha(ti.color, 0.30); ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
        }

        drawHandTherblig(leftLM,  ld3?.therbligL, leftVTrailRef.current);
        drawHandTherblig(rightLM, ld3?.therbligR, rightVTrailRef.current);
      }

      // ── Object bounding-boxes + floating etiquetas (mirror space) ─────────
      if (allDets.length) {
        for (const det of allDets) {
          const bb = det.boundingBox;
          // Draw bbox
          ctx.save();
          ctx.strokeStyle = det.color; ctx.lineWidth = 2;
          ctx.shadowColor = det.color; ctx.shadowBlur = 14;
          ctx.fillStyle   = ha(det.color, 0.08);
          ctx.beginPath(); ctx.roundRect(bb.originX, bb.originY, bb.width, bb.height, 6);
          ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
          // Label above bbox
          const labelText = `${det.emoji} ${det.labelEs}`;
          ctx.font = 'bold 12px Arial';
          const tw = ctx.measureText(labelText).width;
          const lx = bb.originX; const ly = bb.originY - 30;
          ctx.fillStyle = 'rgba(0,0,0,0.72)';
          ctx.beginPath(); ctx.roundRect(lx, ly, tw + 18, 24, 6); ctx.fill();
          ctx.strokeStyle = ha(det.color, 0.7); ctx.lineWidth = 1.2; ctx.stroke();
          ctx.fillStyle = det.color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.shadowColor = det.color; ctx.shadowBlur = 6;
          ctx.fillText(labelText, lx + 9, ly + 12);
          ctx.shadowBlur = 0; ctx.restore();
        }
        // Floating object etiqueta near each hand wrist
        function drawHandObjLabel(lm: any, det: DetectedObject | null, color: string) {
          if (!lm || !det) return;
          const wx = lm[0].x * W;
          const wy = lm[0].y * H;
          const text = `${det.emoji} ${det.labelEs}  ${det.score}%`;
          ctx.font = 'bold 13px Arial';
          const tw2 = ctx.measureText(text).width;
          const bw2 = tw2 + 20; const bh2 = 26;
          const bx2 = wx - bw2 / 2; const by2 = wy - 70;
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.beginPath(); ctx.roundRect(bx2, by2, bw2, bh2, 8); ctx.fill();
          ctx.strokeStyle = ha(det.color, 0.85); ctx.lineWidth = 1.5;
          ctx.shadowColor = det.color; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
          ctx.fillStyle = det.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(text, wx, by2 + bh2 / 2);
          // Arrow line from label to wrist
          ctx.beginPath(); ctx.moveTo(wx, by2 + bh2); ctx.lineTo(wx, wy - 10);
          ctx.strokeStyle = ha(det.color, 0.40); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          ctx.stroke(); ctx.setLineDash([]);
        }
        drawHandObjLabel(leftLM,  lObjInHand,  '#818cf8');
        drawHandObjLabel(rightLM, rObjInHand,  '#f43f5e');
      }

      // Velocity-colored trails (azul=lento → rojo=rápido)
      function drawVTrail(trail:{x:number;y:number;vel:number}[]) {
        if(trail.length<2) return;
        for(let i=1;i<trail.length;i++){
          const t=i/trail.length;
          const col=velColor(trail[i].vel);
          ctx.beginPath();
          ctx.moveTo(trail[i-1].x*W,trail[i-1].y*H);
          ctx.lineTo(trail[i].x*W,trail[i].y*H);
          ctx.strokeStyle=col.replace('rgb(','rgba(').replace(')',`,${t*0.85})`);
          ctx.lineWidth=t*5; ctx.lineCap='round';
          ctx.shadowColor=col; ctx.shadowBlur=t*10;
          ctx.stroke(); ctx.shadowBlur=0;
        }
      }
      drawVTrail(leftVTrailRef.current);
      drawVTrail(rightVTrailRef.current);

      // Particles
      const ps=particlesRef.current;
      for(let i=ps.length-1;i>=0;i--){
        const p=ps[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.08; p.life-=0.042;
        if(p.life<=0){ps.splice(i,1);continue;}
        ctx.beginPath();ctx.arc(p.x,p.y,3.5*p.life,0,Math.PI*2);
        ctx.fillStyle=ha(p.color,p.life*0.85); ctx.shadowColor=p.color; ctx.shadowBlur=9; ctx.fill(); ctx.shadowBlur=0;
      }

      // Virtual object
      if (virtualObject!=='none') {
        const rGt=rGes?.type||'None';
        const lGt=lGes?.type||'None';
        const gGrab=rGt==='Closed_Fist'||lGt==='Closed_Fist';
        const oGrab=rightOpenRef.current||leftOpenRef.current;
        const isGrabbed=(gGrab||oGrab<0.30)&&!!(rightLM||leftLM);
        drawObject(ctx,objPosRef.current.x,objPosRef.current.y,virtualObject,objScaleRef.current,isGrabbed);
      }

      ctx.restore(); // end mirror

      // ── Heatmap overlay (no mirror — already stored in mirrored coords) ───
      if (showHeatmap && heatMaxRef.current > 0) {
        const cellW = W / HEAT_W; const cellH = H / HEAT_H;
        ctx.save();
        for (let hy=0; hy<HEAT_H; hy++) {
          for (let hx=0; hx<HEAT_W; hx++) {
            const v = heatBufRef.current[hy*HEAT_W+hx] / heatMaxRef.current;
            if (v < 0.04) continue;
            const px = hx * cellW; const py = hy * cellH;
            const r  = Math.round(255 * Math.min(1, v * 2));
            const g  = Math.round(255 * Math.max(0, 1 - Math.abs(v - 0.5) * 2));
            const b  = Math.round(255 * Math.max(0, 1 - v * 2));
            const grd = ctx.createRadialGradient(px+cellW/2,py+cellH/2,0,px+cellW/2,py+cellH/2,cellW*1.8);
            grd.addColorStop(0, `rgba(${r},${g},${b},${Math.min(0.75, v*0.85)})`);
            grd.addColorStop(1, 'transparent');
            ctx.fillStyle = grd;
            ctx.fillRect(px-cellW*0.5, py-cellH*0.5, cellW*2, cellH*2);
          }
        }
        // Legend
        ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('MAPA DE CALOR — posición de manos', W/2, H - 8);
        ctx.restore();
      }

      // ── Action event flashes (pick/release) ──────────────────────────────
      for (const ev of actionEventsRef.current) {
        const age   = Date.now() - ev.startTime;
        const alpha = Math.max(0, 1 - age / 2500);
        const rise  = Math.max(0, 1 - age / 800); // moves upward as it fades
        const isPickup = ev.type === 'pickup';
        const evColor  = isPickup ? '#4ade80' : '#fb7185';
        const icon     = isPickup ? '🤲 AGARRÓ' : '✋ SOLTÓ';
        const text     = `${ev.emoji} ${icon}  ${ev.label}`;
        const centerX  = ev.side === 'L' ? W * 0.28 : W * 0.72;
        const centerY  = H * 0.5 - rise * 40;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 20px Arial';
        const tw3 = ctx.measureText(text).width;
        // Background pill
        ctx.fillStyle = 'rgba(0,0,0,0.80)';
        ctx.beginPath(); ctx.roundRect(centerX-tw3/2-14, centerY-18, tw3+28, 36, 12); ctx.fill();
        ctx.strokeStyle = evColor; ctx.lineWidth = 2;
        ctx.shadowColor = evColor; ctx.shadowBlur = 20; ctx.stroke(); ctx.shadowBlur = 0;
        // Text
        ctx.fillStyle = evColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = evColor; ctx.shadowBlur = 12;
        ctx.fillText(text, centerX, centerY);
        ctx.shadowBlur = 0; ctx.restore();
      }

      // ── HUD (no mirror) ───────────────────────────────────────────────────
      drawHUD(ctx, W, H, liveDataRef.current, lGes, rGes, lObjInHand, rObjInHand);

      // FPS
      fpsCountRef.current++;
      const nowMs=Date.now();
      if(nowMs-lastFpsTimeRef.current>=1000){onFps?.(fpsCountRef.current);fpsCountRef.current=0;lastFpsTimeRef.current=nowMs;}

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [showSkeleton, virtualObject, onFps, drawHUD, showHeatmap]);

  // ── Init / destroy ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) {
      cancelAnimationFrame(rafRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      gestureRef.current?.close(); gestureRef.current = null;
      poseRef.current?.close();    poseRef.current    = null;
      faceRef.current?.close();    faceRef.current    = null;
      objDetRef.current?.close();  objDetRef.current  = null;
      leftTrailRef.current=[]; rightTrailRef.current=[]; particlesRef.current=[];
      leftVTrailRef.current=[]; rightVTrailRef.current=[];
      lastPoseRef.current=null; lastFaceRef.current=null;
      lastObjRef.current=[]; lastLeftObjRef.current=null; lastRightObjRef.current=null;
      heatBufRef.current.fill(0); heatMaxRef.current=0;
      actionEventsRef.current=[]; prevLObjKeyRef.current=null; prevRObjKeyRef.current=null;
      setStatus('idle'); return;
    }

    setStatus('loading');
    let mounted = true;

    (async () => {
      try {
        setLoadStage('Cargando Vision AI…');
        const tv = await loadTV();
        if (!mounted) return;

        const vision = await tv.FilesetResolver.forVisionTasks(WASM_CDN);
        if (!mounted) return;

        setLoadStage('Reconocimiento de gestos…');
        let ges: GRType;
        try {
          ges = await tv.GestureRecognizer.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_GES, delegate: 'GPU' },
            runningMode: 'VIDEO', numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch {
          // GPU failed → CPU fallback
          ges = await tv.GestureRecognizer.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_GES },
            runningMode: 'VIDEO', numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        }
        if (!mounted) return;
        gestureRef.current = ges;

        setLoadStage('Análisis de postura…');
        let pos: PLType;
        try {
          pos = await tv.PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_POS, delegate: 'GPU' },
            runningMode: 'VIDEO', numPoses: 1,
          });
        } catch {
          pos = await tv.PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_POS },
            runningMode: 'VIDEO', numPoses: 1,
          });
        }
        if (!mounted) return;
        poseRef.current = pos;

        setLoadStage('Análisis de expresiones…');
        let fac: FLType;
        try {
          fac = await tv.FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_FAC, delegate: 'GPU' },
            runningMode: 'VIDEO', numFaces: 1,
            outputFaceBlendshapes: true,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch {
          fac = await tv.FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_FAC },
            runningMode: 'VIDEO', numFaces: 1,
            outputFaceBlendshapes: true,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        }
        if (!mounted) return;
        faceRef.current = fac;

        setLoadStage('Detección de objetos…');
        try {
          const obj = await tv.ObjectDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_OBJ, delegate: 'GPU' },
            runningMode: 'VIDEO', maxResults: 6, scoreThreshold: 0.35,
          });
          if (mounted) objDetRef.current = obj;
        } catch {
          try {
            const obj = await tv.ObjectDetector.createFromOptions(vision, {
              baseOptions: { modelAssetPath: MODEL_OBJ },
              runningMode: 'VIDEO', maxResults: 6, scoreThreshold: 0.35,
            });
            if (mounted) objDetRef.current = obj;
          } catch { /* object detection optional */ }
        }
        if (!mounted) return;

        setLoadStage('Iniciando cámara…');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width:{ideal:640}, height:{ideal:480}, facingMode:'user' },
        });
        if (!mounted || !videoRef.current) { stream.getTracks().forEach(t=>t.stop()); return; }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (!mounted) return;

        startLoop();
        setStatus('ready');
      } catch (e: any) {
        if (mounted) { setErrorMsg(e?.message||'Error iniciando Vision AI'); setStatus('error'); }
      }
    })();

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t=>t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      }
      gestureRef.current?.close();
      poseRef.current?.close();
      faceRef.current?.close();
      objDetRef.current?.close();
    };
  }, [isActive, startLoop]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-black" style={{aspectRatio:'4/3'}}>
      <video ref={videoRef} className="w-full h-full object-cover" style={{transform:'scaleX(-1)'}} playsInline muted />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {status === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/78">
          <Camera className="w-14 h-14 text-primary opacity-25" />
          <p className="text-sm text-muted-foreground">Presiona <span className="text-primary font-semibold">Iniciar sesión</span></p>
        </div>
      )}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/88">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-2 rounded-full border border-t-accent border-r-transparent border-b-transparent border-l-transparent animate-spin" style={{animationDuration:'1.4s',animationDirection:'reverse'}} />
          </div>
          <div className="text-center space-y-2">
            <p className="text-sm font-bold text-primary tracking-wide">CARGANDO VISION AI</p>
            <p className="text-xs text-muted-foreground">{loadStage}</p>
            <div className="flex justify-center gap-1 mt-2">
              {['Gestos','Postura','Expresiones','Objetos','Cámara'].map((l,i)=>(
                <span key={l} className="text-[10px] px-2 py-0.5 rounded-full border border-primary/20 text-primary/60 animate-pulse" style={{animationDelay:`${i*0.28}s`}}>{l}</span>
              ))}
            </div>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/88">
          <WifiOff className="w-10 h-10 text-destructive" />
          <p className="text-sm text-destructive font-bold">Error en Vision AI</p>
          <p className="text-xs text-muted-foreground max-w-52 text-center">{errorMsg}</p>
          <p className="text-xs text-muted-foreground/60 max-w-60 text-center">Verifica conexión a internet (modelos en CDN) y permiso de cámara.</p>
        </div>
      )}
      {status === 'ready' && (
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <button
            onClick={() => { setShowHeatmap(v => !v); if (showHeatmap) { heatBufRef.current.fill(0); heatMaxRef.current=0; } }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all"
            style={{
              background: showHeatmap ? 'rgba(251,146,60,0.25)' : 'rgba(0,0,0,0.50)',
              border: showHeatmap ? '1px solid rgba(251,146,60,0.6)' : '1px solid rgba(255,255,255,0.1)',
              color: showHeatmap ? '#fb923c' : 'rgba(255,255,255,0.7)',
            }}
          >
            🌡️ Mapa
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10">
            <span className="live-dot" />
            <span className="text-xs font-bold text-white tracking-wider">LIVE · Tasks AI</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraFeed;
