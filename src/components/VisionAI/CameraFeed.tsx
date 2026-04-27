import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, WifiOff } from 'lucide-react';
import { VisionResults, VirtualObjectType, TherbligType, TherbligEvent, EmotionLevel, PostureScore } from './types';
import { THERBLIG_INFO, EMOTION_INFO } from './utils';

declare global {
  interface Window {
    Holistic: any; Camera: any; drawConnectors: any; drawLandmarks: any;
    HAND_CONNECTIONS: any; POSE_CONNECTIONS: any; FACEMESH_TESSELATION: any;
    FACEMESH_RIGHT_EYE: any; FACEMESH_LEFT_EYE: any; FACEMESH_LIPS: any; FACEMESH_FACE_OVAL: any;
  }
}

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe';
const MAX_TRAIL = 30;
const MAX_PARTICLES = 100;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous';
    s.onload = () => resolve(); s.onerror = () => reject(new Error(`Failed: ${src}`));
    document.head.appendChild(s);
  });
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

function ha(color: string, alpha: number): string {
  return color + Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
}

// ── Virtual object colors ─────────────────────────────────────────────────────
const OBJ_COLOR: Record<string, string> = {
  caja:'#22d3ee', herramienta:'#f59e0b', componente:'#818cf8', pantalla:'#34d399',
  boton:'#f43f5e', martillo:'#fb923c', tornillo:'#a3e635', destornillador:'#e879f9',
  pcb:'#34d399', engranaje:'#fbbf24', palanca:'#60a5fa',
};

// ox/oy = centre position in canvas pixel space (already inside mirror transform)
function drawObject(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  type: VirtualObjectType,
  objScale: number,
  isGrabbed: boolean,
) {
  if (type === 'none') return;
  const color = OBJ_COLOR[type] || '#22d3ee';
  const s = Math.max(28, objScale * 62);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.strokeStyle = color;
  ctx.fillStyle = ha(color, isGrabbed ? 0.30 : 0.16);
  ctx.lineWidth = isGrabbed ? 3.5 : 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = isGrabbed ? 36 : 16;

  // Grab ring
  if (isGrabbed) {
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.18, 0, Math.PI * 2);
    ctx.strokeStyle = ha(color, 0.28);
    ctx.lineWidth = 8;
    ctx.setLineDash([10, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
  }

  if (type === 'caja') {
    const d = s * 0.4;
    ctx.fillRect(-s/2,-s/2,s,s); ctx.strokeRect(-s/2,-s/2,s,s);
    ctx.beginPath();
    ctx.moveTo(-s/2,-s/2); ctx.lineTo(-s/2+d,-s/2-d*0.65);
    ctx.moveTo(s/2,-s/2);  ctx.lineTo(s/2+d,-s/2-d*0.65);
    ctx.moveTo(s/2,s/2);   ctx.lineTo(s/2+d,s/2-d*0.65);
    ctx.moveTo(-s/2+d,-s/2-d*0.65); ctx.lineTo(s/2+d,-s/2-d*0.65);
    ctx.moveTo(s/2+d,-s/2-d*0.65);  ctx.lineTo(s/2+d,s/2-d*0.65);
    ctx.stroke();
  } else if (type === 'herramienta') {
    ctx.beginPath(); ctx.roundRect(-7,-s,14,s*2,3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,-s,20,11,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  } else if (type === 'martillo') {
    ctx.fillRect(-6,0,12,s*1.3); ctx.strokeRect(-6,0,12,s*1.3);
    ctx.fillRect(-s*0.55,-s*0.55,s*1.1,s*0.6); ctx.strokeRect(-s*0.55,-s*0.55,s*1.1,s*0.6);
  } else if (type === 'tornillo') {
    ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(0,s*0.8); ctx.stroke();
    for (let i=0;i<7;i++) { const y=-s+i*(s*1.8/6); ctx.beginPath(); ctx.moveTo(-11,y); ctx.lineTo(11,y+s*0.14); ctx.stroke(); }
    ctx.fillRect(-14,-s,28,14); ctx.strokeRect(-14,-s,28,14);
  } else if (type === 'destornillador') {
    ctx.beginPath(); ctx.moveTo(-3,-s*1.1); ctx.lineTo(3,-s*1.1); ctx.lineTo(1.5,s*0.7); ctx.lineTo(-1.5,s*0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,-s*0.45,12,s*0.38,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillRect(-4,s*0.7,8,s*0.5); ctx.strokeRect(-4,s*0.7,8,s*0.5);
  } else if (type === 'componente') {
    ctx.fillRect(-s*0.9,-s*0.5,s*1.8,s); ctx.strokeRect(-s*0.9,-s*0.5,s*1.8,s);
    for (let i=0;i<6;i++) { ctx.beginPath(); ctx.arc(-s*0.7+i*s*0.28,-s*0.5,4,0,Math.PI*2); ctx.fill(); }
    ctx.strokeStyle = ha(color,0.5); ctx.lineWidth=1;
    for (let i=0;i<3;i++) ctx.strokeRect(-s*0.7+i*s*0.44,-s*0.25,s*0.36,s*0.5);
  } else if (type === 'pantalla') {
    const sw=s*1.65; const sh=s; ctx.fillRect(-sw/2,-sh/2,sw,sh); ctx.strokeRect(-sw/2,-sh/2,sw,sh);
    ctx.strokeStyle=ha(color,0.45); ctx.strokeRect(-sw/2+5,-sh/2+5,sw-10,sh-10);
    ctx.fillStyle=ha(color,0.08); ctx.fillRect(-sw/2+8,-sh/2+8,sw-16,sh-16);
  } else if (type === 'boton') {
    ctx.beginPath(); ctx.ellipse(0,0,s*0.62,s*0.36,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur=22; ctx.beginPath(); ctx.ellipse(0,-4,s*0.42,s*0.23,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  } else if (type === 'pcb') {
    const pw=s*1.6; const ph=s*1.1;
    ctx.fillStyle='#0d4f3c'; ctx.fillRect(-pw/2,-ph/2,pw,ph);
    ctx.strokeStyle=color; ctx.strokeRect(-pw/2,-ph/2,pw,ph);
    ctx.lineWidth=1; ctx.strokeStyle=ha(color,0.6);
    for (let r=0;r<3;r++) for (let c=0;c<4;c++) {
      ctx.beginPath(); ctx.arc(-pw/2+s*0.28+c*s*0.36,-ph/2+s*0.28+r*s*0.24,4,0,Math.PI*2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-pw/2+10,-ph/4); ctx.lineTo(0,-ph/4); ctx.lineTo(0,0); ctx.lineTo(pw/2-10,0); ctx.stroke();
  } else if (type === 'engranaje') {
    const teeth=10; const r1=s*0.52; const r2=s*0.72;
    ctx.beginPath();
    for (let i=0;i<teeth*2;i++) {
      const a=(i/(teeth*2))*Math.PI*2; const r=i%2===0?r2:r1;
      i===0?ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r):ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,s*0.2,0,Math.PI*2);
    ctx.fillStyle='#0a0a1a'; ctx.fill(); ctx.strokeStyle=color; ctx.stroke();
  } else if (type === 'palanca') {
    ctx.fillRect(-8,-s*0.12,s*1.4,18); ctx.strokeRect(-8,-s*0.12,s*1.4,18);
    ctx.fillRect(-8,-s,16,s*0.92); ctx.strokeRect(-8,-s,16,s*0.92);
    ctx.beginPath(); ctx.arc(0,-s,19,0,Math.PI*2); ctx.fill(); ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.round(s * 0.22)}px Arial`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const lbl = isGrabbed ? `✊ ${type.toUpperCase()}` : type.toUpperCase();
  ctx.shadowColor = color; ctx.shadowBlur = isGrabbed ? 12 : 4;
  ctx.fillText(lbl, 0, s * 1.55 + 10);
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Types & interfaces ────────────────────────────────────────────────────────
interface Particle { x:number; y:number; vx:number; vy:number; life:number; color:string; }

interface LiveData {
  emotionLevel:  EmotionLevel | null;
  emotionScore:  number;
  posture:       PostureScore | null;
  therbligL:     TherbligType | null;
  therbligR:     TherbligType | null;
  efficiencyPct: number;
  isDrowsy:      boolean;
  therbligHistory: TherbligEvent[];
}

interface Props {
  isActive:      boolean;
  onResults:     (r: VisionResults) => void;
  showSkeleton:  boolean;
  virtualObject: VirtualObjectType;
  onFps?:        (fps: number) => void;
  liveData?:     LiveData;
}

// ── Component ─────────────────────────────────────────────────────────────────
const CameraFeed: React.FC<Props> = ({
  isActive, onResults, showSkeleton, virtualObject, onFps, liveData,
}) => {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const holisticRef = useRef<any>(null);
  const cameraRef   = useRef<any>(null);
  const rafRef      = useRef<number>(0);

  // Frame data refs
  const latestResultsRef = useRef<any>(null);
  const newFrameRef      = useRef(false);
  const leftTrailRef     = useRef<{x:number;y:number}[]>([]);
  const rightTrailRef    = useRef<{x:number;y:number}[]>([]);
  const particlesRef     = useRef<Particle[]>([]);
  const leftOpenRef      = useRef(0.5);
  const rightOpenRef     = useRef(0.5);
  const achieveRef       = useRef(0);
  const prevEffRef       = useRef(0);
  const lastBeepRef      = useRef(0);
  const drowsyFramesRef  = useRef(0);
  const fpsCountRef      = useRef(0);
  const lastFpsTime      = useRef(Date.now());
  const liveDataRef      = useRef<LiveData | undefined>(liveData);

  // Physics refs for virtual object
  const objPosRef          = useRef({ x: 320, y: 200 });
  const objVelRef          = useRef({ x: 2.5, y: 0 });
  const objGrabbedRef      = useRef(false);
  const throwVelRef        = useRef({ x: 0, y: 0 });
  const objScaleRef        = useRef(1.0);
  const objInitRef         = useRef(false);
  const prevTwoHandDistRef = useRef(0);

  // Therblig flash on change
  const prevTherbligRef   = useRef<string | null>(null);
  const therbligFlashRef  = useRef(0);

  useEffect(() => { liveDataRef.current = liveData; }, [liveData]);

  // Reset physics when object type changes
  useEffect(() => {
    objInitRef.current  = false;
    objVelRef.current   = { x: 2.5, y: 0 };
    objGrabbedRef.current = false;
    objScaleRef.current = 1.0;
    prevTwoHandDistRef.current = 0;
  }, [virtualObject]);

  const [status, setStatus]     = useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // ── RAF draw loop (60fps) ─────────────────────────────────────────────────
  const startRaf = useCallback(() => {
    // Reset physics fresh each startRaf call
    objInitRef.current  = false;
    objVelRef.current   = { x: 2.5, y: 0 };
    objGrabbedRef.current = false;
    objScaleRef.current = 1.0;

    const loop = () => {
      const canvas = canvasRef.current;
      const video  = videoRef.current;
      const res    = latestResultsRef.current;
      if (canvas && video) {
        const vw = video.videoWidth  || 640;
        const vh = video.videoHeight || 480;
        if (canvas.width !== vw || canvas.height !== vh) { canvas.width=vw; canvas.height=vh; }
        const ctx = canvas.getContext('2d', { alpha: true })!;
        const w = canvas.width; const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // ── Update trails + two-hand scale when new MediaPipe frame arrives ──
        if (newFrameRef.current && res) {
          newFrameRef.current = false;

          function updateTrail(
            lm: any,
            trailRef: React.MutableRefObject<{x:number;y:number}[]>,
            openRef:  React.MutableRefObject<number>,
            pColor:   string,
          ) {
            if (!lm) { trailRef.current = []; return; }
            const wrist = { x: lm[0].x, y: lm[0].y };
            const tr = trailRef.current;
            if (!tr.length || Math.hypot(wrist.x - tr[tr.length-1].x, wrist.y - tr[tr.length-1].y) > 0.004) {
              tr.push(wrist); if (tr.length > MAX_TRAIL) tr.shift();
            }
            const spread = lm[8] && lm[20] ? Math.hypot(lm[8].x - lm[20].x, lm[8].y - lm[20].y) * 4.5 : 0.5;
            openRef.current = Math.max(0, Math.min(1, spread));
            if (tr.length >= 2) {
              const prev = tr[tr.length - 2];
              const v = Math.hypot(wrist.x - prev.x, wrist.y - prev.y);
              if (v > 0.018) {
                const px = wrist.x * w; const py = wrist.y * h;
                for (let i = 0; i < 5; i++) {
                  const a = Math.random() * Math.PI * 2; const sp = 2 + Math.random() * 5;
                  particlesRef.current.push({ x: px, y: py, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, life: 1, color: pColor });
                }
                if (particlesRef.current.length > MAX_PARTICLES) particlesRef.current = particlesRef.current.slice(-MAX_PARTICLES);
              }
            }
          }
          updateTrail(res.leftHandLandmarks,  leftTrailRef,  leftOpenRef,  '#818cf8');
          updateTrail(res.rightHandLandmarks, rightTrailRef, rightOpenRef, '#f43f5e');

          // Two-hand pinch → scale virtual object
          if (virtualObject !== 'none' && res.leftHandLandmarks && res.rightHandLandmarks) {
            const lh0 = res.leftHandLandmarks[0]; const rh0 = res.rightHandLandmarks[0];
            const dist = Math.hypot(lh0.x - rh0.x, lh0.y - rh0.y);
            if (prevTwoHandDistRef.current > 0.01 && dist > 0.01) {
              const ratio = dist / prevTwoHandDistRef.current;
              objScaleRef.current = Math.max(0.28, Math.min(3.2, objScaleRef.current * ratio));
            }
            prevTwoHandDistRef.current = dist;
          } else {
            prevTwoHandDistRef.current = 0;
          }
        }

        // ── Virtual object physics (every frame = smooth) ──
        if (virtualObject !== 'none') {
          const hand      = res?.rightHandLandmarks || res?.leftHandLandmarks;
          const openness  = rightOpenRef.current || leftOpenRef.current;
          const isGrabbed = openness < 0.30 && !!hand;

          if (!objInitRef.current) {
            objPosRef.current = { x: w * 0.5, y: h * 0.28 };
            objInitRef.current = true;
          }

          if (isGrabbed && hand) {
            const tx = hand[0].x * w;
            const ty = hand[0].y * h;
            throwVelRef.current = {
              x: (tx - objPosRef.current.x) * 0.55,
              y: (ty - objPosRef.current.y) * 0.55,
            };
            objPosRef.current.x += (tx - objPosRef.current.x) * 0.38;
            objPosRef.current.y += (ty - objPosRef.current.y) * 0.38;
            objGrabbedRef.current = true;
          } else {
            if (objGrabbedRef.current) {
              objVelRef.current = {
                x: throwVelRef.current.x * 4.5,
                y: throwVelRef.current.y * 4.5,
              };
              objGrabbedRef.current = false;
            }
            const GRAVITY = 0.38; const BOUNCE = 0.60; const FRICTION = 0.987;
            objVelRef.current.vy += GRAVITY;
            objVelRef.current.vx *= FRICTION;
            objPosRef.current.x  += objVelRef.current.vx;
            objPosRef.current.y  += objVelRef.current.vy;

            const margin = 52;
            if (objPosRef.current.x < margin)     { objPosRef.current.x = margin;     objVelRef.current.vx =  Math.abs(objVelRef.current.vx) * BOUNCE; }
            if (objPosRef.current.x > w - margin)  { objPosRef.current.x = w - margin;  objVelRef.current.vx = -Math.abs(objVelRef.current.vx) * BOUNCE; }
            if (objPosRef.current.y < margin)      { objPosRef.current.y = margin;      objVelRef.current.vy =  Math.abs(objVelRef.current.vy) * BOUNCE; }
            if (objPosRef.current.y > h - margin)  { objPosRef.current.y = h - margin;  objVelRef.current.vy = -Math.abs(objVelRef.current.vy) * BOUNCE; if (Math.abs(objVelRef.current.vy) < 0.5) objVelRef.current.vy = 0; }
          }
        }

        // ── Vignette (symmetric, no mirror needed) ──
        const vig = ctx.createRadialGradient(w/2,h/2,h*0.22,w/2,h/2,h*0.82);
        vig.addColorStop(0,'transparent'); vig.addColorStop(1,'rgba(0,0,0,0.44)');
        ctx.fillStyle = vig; ctx.fillRect(0,0,w,h);

        // ── Mirror transform: skeleton · trails · particles · virtual object ──
        // The canvas has NO CSS scaleX(-1). We mirror here in the drawing context
        // so landmarks align with the CSS-mirrored video, while HUD text stays readable.
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);

        // Skeleton
        if (showSkeleton && res && window.drawConnectors && window.drawLandmarks) {
          const { drawConnectors: dc, drawLandmarks: dl } = window;
          const ld = liveDataRef.current;
          const rulaColor = !ld?.posture ? '#22d3ee'
            : ld.posture.risk === 'low'    ? '#22d3ee'
            : ld.posture.risk === 'medium' ? '#a3e635'
            : ld.posture.risk === 'high'   ? '#fb923c' : '#f43f5e';

          if (res.poseLandmarks) {
            ctx.shadowColor = rulaColor; ctx.shadowBlur = 7;
            dc(ctx, res.poseLandmarks, window.POSE_CONNECTIONS, { color: ha(rulaColor, 0.35), lineWidth: 2.5 });
            dl(ctx, res.poseLandmarks, { color: rulaColor, lineWidth: 1, radius: 3 });
            ctx.shadowBlur = 0;
          }
          if (res.faceLandmarks) {
            ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 4;
            dc(ctx, res.faceLandmarks, window.FACEMESH_FACE_OVAL, { color: '#22d3ee1a', lineWidth: 1 });
            dc(ctx, res.faceLandmarks, window.FACEMESH_RIGHT_EYE, { color: '#22d3ee99', lineWidth: 1.5 });
            dc(ctx, res.faceLandmarks, window.FACEMESH_LEFT_EYE,  { color: '#22d3ee99', lineWidth: 1.5 });
            dc(ctx, res.faceLandmarks, window.FACEMESH_LIPS,      { color: '#f43f5e88', lineWidth: 1.5 });
            ctx.shadowBlur = 0;
          }
          if (res.leftHandLandmarks) {
            ctx.shadowColor = '#818cf8'; ctx.shadowBlur = 10;
            dc(ctx, res.leftHandLandmarks, window.HAND_CONNECTIONS, { color: '#818cf8cc', lineWidth: 2.5 });
            dl(ctx, res.leftHandLandmarks, { color: '#c4b5fd', lineWidth: 1, radius: 4.5 });
            ctx.shadowBlur = 0;
          }
          if (res.rightHandLandmarks) {
            ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 10;
            dc(ctx, res.rightHandLandmarks, window.HAND_CONNECTIONS, { color: '#f43f5ecc', lineWidth: 2.5 });
            dl(ctx, res.rightHandLandmarks, { color: '#fda4af', lineWidth: 1, radius: 4.5 });
            ctx.shadowBlur = 0;
          }
        }

        // Trails (normalized coords × w/h = still in pre-mirror space → mirror applies ✓)
        function drawTrail(trail: {x:number;y:number}[], color: string) {
          if (trail.length < 2) return;
          for (let i = 1; i < trail.length; i++) {
            const t = i / trail.length;
            ctx.beginPath();
            ctx.moveTo(trail[i-1].x * w, trail[i-1].y * h);
            ctx.lineTo(trail[i].x   * w, trail[i].y   * h);
            ctx.strokeStyle = ha(color, t * 0.65); ctx.lineWidth = t * 4.5;
            ctx.lineCap = 'round'; ctx.shadowColor = color; ctx.shadowBlur = t * 8;
            ctx.stroke(); ctx.shadowBlur = 0;
          }
        }
        drawTrail(leftTrailRef.current,  '#818cf8');
        drawTrail(rightTrailRef.current, '#f43f5e');

        // Particles (pixel coords, mirror applies ✓)
        const ps = particlesRef.current;
        for (let i = ps.length - 1; i >= 0; i--) {
          const p = ps[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.042;
          if (p.life <= 0) { ps.splice(i, 1); continue; }
          ctx.beginPath(); ctx.arc(p.x, p.y, 3.5 * p.life, 0, Math.PI * 2);
          ctx.fillStyle = ha(p.color, p.life * 0.85);
          ctx.shadowColor = p.color; ctx.shadowBlur = 9; ctx.fill(); ctx.shadowBlur = 0;
        }

        // Virtual object (physics pos in pre-mirror pixel space → mirror applies ✓)
        if (virtualObject !== 'none') {
          const openness  = rightOpenRef.current || leftOpenRef.current;
          const isGrabbed = openness < 0.30 && !!(res?.rightHandLandmarks || res?.leftHandLandmarks);
          drawObject(ctx, objPosRef.current.x, objPosRef.current.y, virtualObject, objScaleRef.current, isGrabbed);
        }

        ctx.restore(); // end mirror transform

        // ── HUD (no mirror — text reads correctly) ────────────────────────
        const ld  = liveDataRef.current;
        const pad = 12;
        const R   = 9;

        function pill(x: number, y: number, text: string, color: string, align: 'l'|'r' = 'l') {
          ctx.font = 'bold 13px Arial';
          const tw = ctx.measureText(text).width; const bw = tw + 22; const bh = 26;
          const bx = align === 'r' ? x - bw : x;
          ctx.fillStyle = 'rgba(0,0,0,0.60)'; ctx.beginPath(); ctx.roundRect(bx,y,bw,bh,R); ctx.fill();
          ctx.strokeStyle = ha(color, 0.45); ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 6;
          ctx.textAlign = align === 'r' ? 'right' : 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(text, align === 'r' ? bx + bw - 11 : bx + 11, y + bh / 2);
          ctx.shadowBlur = 0; ctx.textAlign = 'left';
        }

        // Emotion (top-left)
        if (ld?.emotionLevel) {
          const ei = EMOTION_INFO[ld.emotionLevel];
          pill(pad, pad, `${ei.emoji} ${ei.label}  ${ld.emotionScore}%`, ei.color, 'l');
        }
        // RULA (top-right)
        if (ld?.posture) {
          const rc = ld.posture.risk === 'low' ? '#22d3ee' : ld.posture.risk === 'medium' ? '#a3e635' : ld.posture.risk === 'high' ? '#fb923c' : '#f43f5e';
          pill(w - pad, pad, `RULA ${ld.posture.rula}`, rc, 'r');
        }

        // ── Therblig live overlay (centre) — flashes on change ──
        const activeT = ld?.therbligR || ld?.therbligL;
        if (activeT !== prevTherbligRef.current) {
          prevTherbligRef.current = activeT ?? null;
          therbligFlashRef.current = 50;
        }
        if (therbligFlashRef.current > 0) therbligFlashRef.current--;

        if (activeT) {
          const ti = THERBLIG_INFO[activeT];
          if (ti) {
            const flashBoost = therbligFlashRef.current / 50;
            const pulse = 0.88 + 0.12 * Math.sin(Date.now() * 0.004) + flashBoost * 0.12;
            const actionText = `${activeT}  ·  ${ti.label}`;
            ctx.font = 'bold 18px Arial';
            const tw = ctx.measureText(actionText).width;
            const bw = tw + 42; const bh = 40;
            const bx = (w - bw) / 2; const by = pad + 36;

            ctx.globalAlpha = Math.min(1, pulse);
            // glow background
            ctx.shadowColor = ti.color; ctx.shadowBlur = 18 + flashBoost * 14;
            ctx.fillStyle = 'rgba(0,0,0,0.72)';
            ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 13); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = ha(ti.color, 0.75 + flashBoost * 0.25); ctx.lineWidth = 2;
            ctx.stroke();
            // text
            ctx.fillStyle = ti.color;
            ctx.shadowColor = ti.color; ctx.shadowBlur = 16;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(actionText, w / 2, by + bh / 2);
            ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          }
        }

        // Hands bottom pills
        const bY = h - pad - 30;
        if (ld?.therbligL) { const ti = THERBLIG_INFO[ld.therbligL]; if (ti) pill(pad, bY, `← ${ld.therbligL} ${ti.label}`, ti.color, 'l'); }
        if (ld?.therbligR) { const ti = THERBLIG_INFO[ld.therbligR]; if (ti) pill(w - pad, bY, `${ld.therbligR} ${ti.label} →`, ti.color, 'r'); }

        // Efficiency ring (centre bottom)
        if (ld && ld.efficiencyPct > 0) {
          const cx = w / 2; const cy = h - pad - 16;
          const ec = ld.efficiencyPct >= 70 ? '#22d3ee' : ld.efficiencyPct >= 45 ? '#fbbf24' : '#f43f5e';
          ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.60)'; ctx.fill();
          ctx.beginPath(); ctx.arc(cx, cy, 20, -Math.PI/2, -Math.PI/2 + Math.PI*2*(ld.efficiencyPct/100));
          ctx.strokeStyle = ec; ctx.lineWidth = 4;
          ctx.shadowColor = ec; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
          ctx.fillStyle = ec; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(`${ld.efficiencyPct}%`, cx, cy);
        }

        // Timeline bar
        if (ld?.therbligHistory?.length) {
          const tlH = 5; const tlY = h - tlH;
          ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(0, tlY, w, tlH);
          const winMs = 30000; const now2 = Date.now();
          ld.therbligHistory.slice(-80).forEach(e => {
            if (now2 - e.startTime > winMs) return;
            const xS = ((e.startTime - (now2 - winMs)) / winMs) * w;
            const xE = Math.min(w, ((e.startTime + e.duration - (now2 - winMs)) / winMs) * w);
            const ti = THERBLIG_INFO[e.type]; if (!ti || xE <= xS) return;
            ctx.fillStyle = ti.color; ctx.fillRect(xS, tlY, Math.max(2, xE - xS), tlH);
          });
        }

        // Achievement flash
        if (ld && prevEffRef.current < 80 && ld.efficiencyPct >= 80) achieveRef.current = 90;
        if (ld) prevEffRef.current = ld.efficiencyPct;
        if (achieveRef.current > 0) {
          const alpha = Math.min(1, achieveRef.current / 25);
          ctx.globalAlpha = alpha;
          ctx.font = 'bold 28px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 18;
          ctx.fillStyle = '#22d3ee'; ctx.fillText('⚡ EFICIENCIA ALTA', w/2, h/2 - 18);
          ctx.font = '15px Arial'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillText(`${ld?.efficiencyPct || ''}% eficiente`, w/2, h/2 + 14);
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          achieveRef.current--;
        }

        // Drowsiness alarm
        const drowsy = ld?.isDrowsy || false;
        if (drowsy) {
          drowsyFramesRef.current++;
          if (drowsyFramesRef.current > 30) {
            const pulse = 0.28 + 0.15 * Math.sin(Date.now() * 0.008);
            ctx.fillStyle = `rgba(244,63,94,${pulse})`; ctx.fillRect(0,0,w,h);
            ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 5; ctx.strokeRect(3,3,w-6,h-6);
            ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff'; ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 14;
            ctx.fillText('⚠️  SOMNOLENCIA DETECTADA  ⚠️', w/2, h/2);
            ctx.shadowBlur = 0;
            if (Date.now() - lastBeepRef.current > 3000) { playBeep(); lastBeepRef.current = Date.now(); }
          }
        } else { drowsyFramesRef.current = 0; }

        // Object physics hint (bottom-right, only when active and not grabbed)
        if (virtualObject !== 'none' && !objGrabbedRef.current) {
          ctx.font = '11px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.fillText('✊ puño = agarrar  ·  👐 dos manos = escalar', w - pad, h - 8);
        }
      }

      fpsCountRef.current++;
      const nowFps = Date.now();
      if (nowFps - lastFpsTime.current >= 1000) {
        onFps?.(fpsCountRef.current); fpsCountRef.current = 0; lastFpsTime.current = nowFps;
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [showSkeleton, virtualObject, onFps]);

  // ── MediaPipe callback ────────────────────────────────────────────────────
  const handleResults = useCallback((results: any) => {
    latestResultsRef.current = results;
    newFrameRef.current = true;
    onResults({
      poseLandmarks:      results.poseLandmarks      || null,
      leftHandLandmarks:  results.leftHandLandmarks  || null,
      rightHandLandmarks: results.rightHandLandmarks || null,
      faceLandmarks:      results.faceLandmarks      || null,
    });
  }, [onResults]);

  // ── Init / destroy MediaPipe ──────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) {
      cancelAnimationFrame(rafRef.current);
      cameraRef.current?.stop(); holisticRef.current?.close();
      cameraRef.current = null; holisticRef.current = null; latestResultsRef.current = null;
      leftTrailRef.current = []; rightTrailRef.current = []; particlesRef.current = [];
      setStatus('idle'); return;
    }
    setStatus('loading');
    (async () => {
      try {
        await Promise.all([
          loadScript(`${CDN}/holistic/holistic.js`),
          loadScript(`${CDN}/camera_utils/camera_utils.js`),
          loadScript(`${CDN}/drawing_utils/drawing_utils.js`),
        ]);
        const holistic = new window.Holistic({ locateFile: (f: string) => `${CDN}/holistic/${f}` });
        holistic.setOptions({
          modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false,
          refineFaceLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.65,
        });
        holistic.onResults(handleResults);
        holisticRef.current = holistic;
        if (!videoRef.current) throw new Error('Video no disponible');
        const cam = new window.Camera(videoRef.current, {
          onFrame: async () => { if (videoRef.current && holisticRef.current) await holisticRef.current.send({ image: videoRef.current }); },
          width: 640, height: 480,
        });
        await cam.start(); cameraRef.current = cam;
        startRaf();
        setStatus('ready');
      } catch (e: any) { setErrorMsg(e?.message || 'Error'); setStatus('error'); }
    })();
    return () => { cancelAnimationFrame(rafRef.current); cameraRef.current?.stop(); holisticRef.current?.close(); };
  }, [isActive, handleResults, startRaf]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '4/3' }}>
      {/* Video mirrored via CSS (natural selfie view) */}
      <video ref={videoRef} className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} playsInline muted />
      {/* Canvas NOT mirrored via CSS — mirror is applied inside the drawing context */}
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
            <div className="absolute inset-2 rounded-full border border-t-accent border-r-transparent border-b-transparent border-l-transparent animate-spin" style={{ animationDuration: '1.4s', animationDirection: 'reverse' }} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-bold text-primary tracking-wide">CARGANDO VISION AI</p>
            <p className="text-xs text-muted-foreground">Descargando modelos de detección…</p>
            <div className="flex justify-center gap-1 mt-2">
              {['Holistic', 'Cámara', 'Drawing'].map((l, i) => (
                <span key={l} className="text-[10px] px-2 py-0.5 rounded-full border border-primary/20 text-primary/60 animate-pulse" style={{ animationDelay: `${i * 0.28}s` }}>{l}</span>
              ))}
            </div>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/88">
          <WifiOff className="w-10 h-10 text-destructive" />
          <p className="text-sm text-destructive font-bold">Sin conexión a modelos</p>
          <p className="text-xs text-muted-foreground max-w-52 text-center">{errorMsg}</p>
        </div>
      )}
      {status === 'ready' && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10">
          <span className="live-dot" />
          <span className="text-xs font-bold text-white tracking-wider">LIVE</span>
        </div>
      )}
    </div>
  );
};

export default CameraFeed;
