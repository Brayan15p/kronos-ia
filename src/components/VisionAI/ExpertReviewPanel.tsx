/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useMemo, useState } from 'react';
import { UserCheck, Camera, AlertTriangle, RotateCcw, Save, Trash2, FileSpreadsheet, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import type { CameraView, ErgoSegment, PostureScore } from './types';
import { CONFIDENCE_COLOR, REBA_RISK_INFO, SEGMENT_LABEL, confidenceLevel, rulaRiskLevel, rebaRiskLevel } from './ergonomics';
import {
  REVIEW_SEGMENTS, SEGMENT_META, FACTOR_META, DEFAULT_FACTORS, RULA_ACTION, EXPERT_NOTE, REVIEW_SOURCE_LABEL,
  createExpertReview, measuredAnglesFromPosture, confidenceFromPosture, fmtAngle, correctedFields,
  loadValidationDataset, addToValidationDataset, removeFromValidationDataset, clearValidationDataset,
  agreementSummary, validationToCSV,
  type ExpertFactors, type ExpertReview, type FactorKey, type PostureAngles, type ReviewSource,
} from './expertReview';
import { todayLocal } from '@/lib/sgsst';

interface Props {
  /** Postura en vivo (o la última medida si la sesión se detuvo). */
  posture: PostureScore | null;
  /** Peor postura de la sesión (mayor RULA con confianza aceptable). */
  criticalPosture: PostureScore | null;
  /** Revisión vigente de la sesión. */
  review: ExpertReview | null;
  onSave: (r: ExpertReview) => void;
  onClear: () => void;
}

/** Postura congelada sobre la que trabaja el experto. */
interface Captured {
  id: string;
  source: ReviewSource;
  measured: PostureAngles;
  confidence: Partial<Record<ErgoSegment, number>>;
  view: CameraView | '';
  side: 'izquierdo' | 'derecho' | '';
}

type Draft = Record<ErgoSegment, string>;

const REVIEWER_KEY = 'kronos_expert_reviewer_v1';
/** Segmentos que la cámara puede no ver: vacío = no visible (se puntúa neutro). */
const OPTIONAL: ErgoSegment[] = ['muneca', 'piernas'];

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const toDraft = (a: PostureAngles): Draft =>
  Object.fromEntries(REVIEW_SEGMENTS.map(s => [s, a[s] == null ? '' : String(Math.round(a[s] as number))])) as Draft;

function parseDraft(d: Draft): { angles: PostureAngles; errors: ErgoSegment[] } {
  const angles = {} as PostureAngles;
  const errors: ErgoSegment[] = [];
  for (const s of REVIEW_SEGMENTS) {
    const raw = d[s].trim().replace(',', '.');
    if (raw === '') {
      angles[s] = null;
      if (!OPTIONAL.includes(s)) errors.push(s);
      continue;
    }
    const v = Number(raw);
    const m = SEGMENT_META[s];
    if (!Number.isFinite(v) || v < m.min || v > m.max) errors.push(s);
    angles[s] = Number.isFinite(v) ? v : null;
  }
  return { angles, errors };
}

const readReviewer = () => {
  try {
    return localStorage.getItem(REVIEWER_KEY) ?? '';
  } catch {
    return '';
  }
};

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const deltaText = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `${d}` : '0');
const deltaColor = (d: number) => (d > 0 ? '#f43f5e' : d < 0 ? '#34d399' : '#94a3b8');
const RULA_COLOR = { low: '#34d399', medium: '#fbbf24', high: '#fb923c', critical: '#f43f5e' } as const;

const label = 'text-[10px] text-muted-foreground uppercase tracking-wider';

function ScoreCompare({ title, max, camera, expert, cameraLabel, expertLabel, cameraColor, expertColor }: {
  title: string; max: number; camera: number; expert: number;
  cameraLabel: string; expertLabel: string; cameraColor: string; expertColor: string;
}) {
  const d = expert - camera;
  return (
    <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.06]" data-testid={`compare-${title.toLowerCase()}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">{title} (1–{max})</p>
      <div className="grid grid-cols-3 gap-2 text-center items-end">
        <div>
          <p className="text-[10px] text-muted-foreground">Cámara (tamizaje)</p>
          <p className="text-xl font-mono font-bold" style={{ color: cameraColor }}>{camera}</p>
          <p className="text-[10px]" style={{ color: cameraColor }}>{cameraLabel}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Experto</p>
          <p className="text-xl font-mono font-bold" style={{ color: expertColor }}>{expert}</p>
          <p className="text-[10px]" style={{ color: expertColor }}>{expertLabel}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Diferencia</p>
          <p className="text-xl font-mono font-bold" style={{ color: deltaColor(d) }}>{deltaText(d)}</p>
          <p className="text-[10px] text-muted-foreground">{d > 0 ? 'cámara subestima' : d < 0 ? 'cámara sobrestima' : 'sin cambio'}</p>
        </div>
      </div>
    </div>
  );
}

/** Resumen de concordancia del conjunto de validación (cámara frente a experto). */
function ValidationSummary({ dataset, onChange }: { dataset: ExpertReview[]; onChange: (d: ExpertReview[]) => void }) {
  const s = useMemo(() => agreementSummary(dataset), [dataset]);
  const fmt = (v: number | null, unit = '') => (v == null ? '—' : `${v.toLocaleString('es-CO')}${unit}`);

  return (
    <details className="text-xs border-t border-white/[0.06] pt-3">
      <summary className="cursor-pointer font-semibold text-foreground">
        Validación cámara vs. experto ({s.n} {s.n === 1 ? 'par' : 'pares'})
      </summary>
      <p className="text-[11px] text-muted-foreground mt-2">
        Cada revisión guardada añade un par (cámara, experto) en este navegador. Sirve para medir la concordancia en puestos reales
        antes de confiar en la cámara. Diferencia absoluta media (DAM) de los ángulos y % de acuerdo exacto en la banda del método
        (sin factores de ajuste); en RULA y REBA finales se incluyen todos los factores.
      </p>
      {s.n === 0 ? (
        <p className="text-muted-foreground mt-2">Aún no hay pares: guarda una revisión del experto.</p>
      ) : (
        <>
          <div className="overflow-x-auto scroll-thin mt-2">
            <table className="w-full min-w-[420px]" aria-label="Concordancia por segmento">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-white/[0.06]">
                  <th className="py-1 pr-2 font-medium">Segmento</th>
                  <th className="py-1 pr-2 font-medium">Pares</th>
                  <th className="py-1 pr-2 font-medium">DAM ángulo</th>
                  <th className="py-1 font-medium">Acuerdo exacto (banda)</th>
                </tr>
              </thead>
              <tbody>
                {REVIEW_SEGMENTS.map(seg => (
                  <tr key={seg} className="border-b border-white/[0.03]">
                    <td className="py-1 pr-2">{SEGMENT_LABEL[seg]}</td>
                    <td className="py-1 pr-2 font-mono">{s.segments[seg].n}</td>
                    <td className="py-1 pr-2 font-mono">{fmt(s.segments[seg].madDeg, '°')}</td>
                    <td className="py-1 font-mono">{fmt(s.segments[seg].exactPct, ' %')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto scroll-thin mt-3">
            <table className="w-full min-w-[420px]" aria-label="Concordancia de puntuaciones finales">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-white/[0.06]">
                  <th className="py-1 pr-2 font-medium">Puntuación</th>
                  <th className="py-1 pr-2 font-medium">DAM</th>
                  <th className="py-1 pr-2 font-medium">Acuerdo exacto</th>
                  <th className="py-1 pr-2 font-medium">± 1 punto</th>
                  <th className="py-1 font-medium">Sesgo (experto − cámara)</th>
                </tr>
              </thead>
              <tbody>
                {(['rula', 'reba'] as const).map(k => (
                  <tr key={k} className="border-b border-white/[0.03]">
                    <td className="py-1 pr-2">{k.toUpperCase()}</td>
                    <td className="py-1 pr-2 font-mono">{fmt(s[k].mad)}</td>
                    <td className="py-1 pr-2 font-mono">{fmt(s[k].exactPct, ' %')}</td>
                    <td className="py-1 pr-2 font-mono">{fmt(s[k].within1Pct, ' %')}</td>
                    <td className="py-1 font-mono">{s[k].meanDiff == null ? '—' : deltaText(s[k].meanDiff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.n < 10 && (
            <p className="text-[11px] text-muted-foreground mt-2">Con menos de 10 pares las cifras son orientativas.</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => downloadText(`kronos_validacion_rula_reba_${todayLocal()}.csv`, validationToCSV(dataset))}
              className="btn-secondary-glass flex items-center gap-1.5 text-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Exportar CSV
            </button>
            <button
              onClick={() => {
                if (!window.confirm('¿Borrar todos los pares de validación guardados en este navegador?')) return;
                clearValidationDataset();
                onChange([]);
              }}
              className="btn-secondary-glass flex items-center gap-1.5 text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" /> Borrar pares
            </button>
          </div>
        </>
      )}
    </details>
  );
}

const ExpertReviewPanel: React.FC<Props> = ({ posture, criticalPosture, review, onSave, onClear }) => {
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [factors, setFactors] = useState<ExpertFactors>(DEFAULT_FACTORS);
  const [reviewer, setReviewer] = useState<string>(readReviewer);
  const [date, setDate] = useState(todayLocal());
  const [puesto, setPuesto] = useState('');
  const [note, setNote] = useState('');
  const [dataset, setDataset] = useState<ExpertReview[]>(() => loadValidationDataset());

  const capture = (p: PostureScore, source: ReviewSource) => {
    const measured = measuredAnglesFromPosture(p);
    setCaptured({
      id: newId(), source, measured, confidence: confidenceFromPosture(p),
      view: p.view?.view ?? '', side: p.rulaDetail?.side ?? '',
    });
    setDraft(toDraft(measured));
    setFactors(DEFAULT_FACTORS);
    setNote('');
  };

  const editSaved = (r: ExpertReview) => {
    setCaptured({ id: r.id, source: r.source, measured: r.measured, confidence: r.confidence, view: r.view, side: r.side });
    setDraft(toDraft(r.angles));
    setFactors(r.factors);
    setReviewer(r.reviewer);
    setDate(r.date || todayLocal());
    setPuesto(r.puesto);
    setNote(r.note);
  };

  const parsed = useMemo(() => (draft ? parseDraft(draft) : null), [draft]);

  const preview = useMemo(() => {
    if (!captured || !parsed || parsed.errors.length) return null;
    return createExpertReview({
      id: captured.id, measured: captured.measured, angles: parsed.angles, factors,
      reviewer, date, note, puesto, source: captured.source, view: captured.view, side: captured.side,
      confidence: captured.confidence,
    });
  }, [captured, parsed, factors, reviewer, date, note, puesto]);

  const setAngle = (s: ErgoSegment, v: string) => setDraft(d => (d ? { ...d, [s]: v } : d));
  const setFactor = <K extends FactorKey>(k: K, v: ExpertFactors[K]) => setFactors(f => ({ ...f, [k]: v }));

  const save = () => {
    if (!preview) {
      toast.error('Revisa los ángulos marcados en rojo.');
      return;
    }
    if (!reviewer.trim()) {
      toast.error('Indica quién revisó la postura.');
      return;
    }
    try {
      localStorage.setItem(REVIEWER_KEY, reviewer.trim());
    } catch {
      /* almacenamiento no disponible */
    }
    const r = { ...preview, createdAt: new Date().toISOString() };
    onSave(r);
    setDataset(addToValidationDataset(r));
    setCaptured(null);
    setDraft(null);
    toast.success('Revisión del experto guardada. Se incluye en el reporte y al guardar en SG-SST.');
  };

  const discard = () => {
    setCaptured(null);
    setDraft(null);
  };

  const removeSaved = () => {
    if (!review) return;
    if (!window.confirm('¿Quitar la revisión del experto de esta sesión? También se borra su par del conjunto de validación.')) return;
    setDataset(removeFromValidationDataset(review.id));
    onClear();
  };

  const factorGroups: { title: string; keys: FactorKey[] }[] = [
    { title: 'Observaciones posturales (RULA y REBA)', keys: ['shoulderRaised', 'armAbducted', 'armSupported', 'wristDeviated', 'wristTwist', 'neckTwisted', 'neckSideBent', 'trunkTwisted', 'trunkSideBent', 'legsUnsupported'] },
    { title: 'Solo RULA', keys: ['lowerArmMidline', 'muscleUse', 'rulaForce'] },
    { title: 'Solo REBA', keys: ['rebaLoad', 'coupling', 'activity'] },
  ];

  return (
    <div className="glass-card p-4 space-y-3" data-testid="expert-review">
      <div className="flex items-center gap-2">
        <UserCheck className="w-4 h-4 text-accent" />
        <h3 className="font-display font-bold text-sm text-foreground">Revisión del experto (RULA / REBA)</h3>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {EXPERT_NOTE} Con una sola cámara, muñeca, cuello y antebrazo son las medidas menos fiables, y factores como el giro de
        muñeca, el hombro elevado, la carga o el agarre no se pueden observar: complétalos aquí.
      </p>

      {/* Revisión guardada */}
      {review && !captured && (
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-1.5 text-xs" data-testid="saved-review">
          <p className="font-semibold text-foreground">
            Revisado por {review.reviewer || 'sin nombre'} · {review.date}{review.puesto ? ` · ${review.puesto}` : ''}
          </p>
          <p className="font-mono">
            RULA cámara {review.camera.rula} → experto {review.expert.rula} · REBA cámara {review.camera.reba} → experto {review.expert.reba}
          </p>
          {correctedFields(review).length > 0 && (
            <p className="text-[11px] text-muted-foreground">Corregido: {correctedFields(review).join(' · ')}</p>
          )}
          {review.note && <p className="text-[11px] text-muted-foreground">Nota: {review.note}</p>}
          <p className="text-[11px] text-muted-foreground">Se incluye en el PDF/CSV de la sesión y al guardar la evaluación en SG-SST.</p>
          <div className="flex gap-2 pt-1">
            <button onClick={() => editSaved(review)} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
            <button onClick={removeSaved} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
              <Trash2 className="w-3.5 h-3.5" /> Quitar
            </button>
          </div>
        </div>
      )}

      {/* Captura */}
      {!captured && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => posture && capture(posture, 'actual')}
            disabled={!posture}
            className="btn-secondary-glass flex items-center gap-1.5 text-xs disabled:opacity-40"
            title="Congela la postura que se ve ahora (o la última medida si la sesión está detenida)."
          >
            <Camera className="w-3.5 h-3.5" /> Revisar postura actual
          </button>
          <button
            onClick={() => criticalPosture && capture(criticalPosture, 'critica')}
            disabled={!criticalPosture}
            className="btn-secondary-glass flex items-center gap-1.5 text-xs disabled:opacity-40"
            title="La postura con mayor RULA de la sesión (entre las de confianza media o alta). Puede ser un fotograma ruidoso: revísala."
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Revisar postura crítica{criticalPosture ? ` (RULA ${criticalPosture.rula})` : ''}
          </button>
          {!posture && !criticalPosture && (
            <p className="text-[11px] text-muted-foreground w-full">Inicia una sesión para capturar una postura.</p>
          )}
        </div>
      )}

      {captured && draft && parsed && (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            {REVIEW_SOURCE_LABEL[captured.source]}
            {captured.side ? ` · lado ${captured.side}` : ''}
            {captured.view ? ` · vista ${captured.view}` : ''}. Ángulos en grados; 0–5° cuenta como neutro (misma tolerancia que la cámara).
          </p>

          {/* Segmentos */}
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-white/[0.06]">
                  <th className="py-1 pr-2 font-medium">Segmento</th>
                  <th className="py-1 pr-2 font-medium">Cámara</th>
                  <th className="py-1 pr-2 font-medium">Experto (°)</th>
                  <th className="py-1 font-medium">Bandas rápidas</th>
                </tr>
              </thead>
              <tbody>
                {REVIEW_SEGMENTS.map(s => {
                  const conf = captured.confidence[s];
                  const lvl = conf == null ? null : confidenceLevel(conf);
                  const err = parsed.errors.includes(s);
                  const changed = !err && (captured.measured[s] == null
                    ? parsed.angles[s] != null
                    : parsed.angles[s] == null || Math.round(parsed.angles[s] as number) !== Math.round(captured.measured[s] as number));
                  const meta = SEGMENT_META[s];
                  return (
                    <tr key={s} className="border-b border-white/[0.03] align-top">
                      <td className="py-1.5 pr-2">
                        <p className="text-foreground">{SEGMENT_LABEL[s]}</p>
                        <p className="text-[10px] text-muted-foreground">{meta.hint}</p>
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        <span className="font-mono">{fmtAngle(captured.measured[s])}</span>
                        {lvl && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-[10px]" title={`Confianza ${lvl}`}>
                            <span className="inline-block w-2 h-2 rounded-full" style={{ background: CONFIDENCE_COLOR[lvl] }} aria-hidden="true" />
                            {Math.round((conf as number) * 100)}%
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center gap-1">
                          <input
                            value={draft[s]}
                            onChange={e => setAngle(s, e.target.value)}
                            inputMode="decimal"
                            aria-label={`Ángulo de ${SEGMENT_LABEL[s].toLowerCase()} según el experto`}
                            aria-invalid={err}
                            placeholder={OPTIONAL.includes(s) ? 'no visible' : ''}
                            className={`input-glass text-xs w-20 py-1 ${err ? 'border-red-500/60' : changed ? 'border-primary/60' : ''}`}
                          />
                          {changed && (
                            <button
                              onClick={() => setAngle(s, captured.measured[s] == null ? '' : String(Math.round(captured.measured[s] as number)))}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label={`Volver al valor de la cámara en ${SEGMENT_LABEL[s].toLowerCase()}`}
                              title="Volver al valor de la cámara"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {err && <p className="text-[10px] text-red-400 mt-0.5">Entre {meta.min}° y {meta.max}°{OPTIONAL.includes(s) ? ' (vacío = no visible)' : ''}</p>}
                      </td>
                      <td className="py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {meta.bands.map(b => (
                            <button
                              key={b.label}
                              onClick={() => setAngle(s, String(b.value))}
                              className={`px-1.5 py-0.5 rounded border text-[10px] ${draft[s] === String(b.value) ? 'border-primary/60 text-primary bg-primary/10' : 'border-white/10 text-muted-foreground hover:text-foreground'}`}
                            >
                              {b.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Factores de ajuste */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {factorGroups.map(g => (
              <fieldset key={g.title} className="space-y-1.5">
                <legend className={label}>{g.title}</legend>
                {g.keys.map(k => {
                  const meta = FACTOR_META[k];
                  const v = factors[k];
                  if (meta.options) {
                    return (
                      <label key={k} className="block text-xs">
                        <span className="text-muted-foreground">{meta.label}</span>
                        <select
                          value={v as number}
                          onChange={e => setFactor(k, Number(e.target.value) as ExpertFactors[typeof k])}
                          className={`input-glass mt-0.5 text-xs py-1 ${v !== DEFAULT_FACTORS[k] ? 'border-primary/60' : ''}`}
                        >
                          {meta.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                    );
                  }
                  return (
                    <label key={k} className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={v as boolean}
                        onChange={e => setFactor(k, e.target.checked as ExpertFactors[typeof k])}
                        className="mt-0.5"
                      />
                      <span className={v !== DEFAULT_FACTORS[k] ? 'text-foreground' : 'text-muted-foreground'}>{meta.label}</span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </div>

          {/* Cámara vs experto */}
          {preview ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ScoreCompare
                title="RULA" max={7} camera={preview.camera.rula} expert={preview.expert.rula}
                cameraLabel={RULA_ACTION[rulaRiskLevel(preview.camera.rula)]} expertLabel={RULA_ACTION[rulaRiskLevel(preview.expert.rula)]}
                cameraColor={RULA_COLOR[rulaRiskLevel(preview.camera.rula)]} expertColor={RULA_COLOR[rulaRiskLevel(preview.expert.rula)]}
              />
              <ScoreCompare
                title="REBA" max={15} camera={preview.camera.reba} expert={preview.expert.reba}
                cameraLabel={REBA_RISK_INFO[rebaRiskLevel(preview.camera.reba)].label} expertLabel={REBA_RISK_INFO[rebaRiskLevel(preview.expert.reba)].label}
                cameraColor={REBA_RISK_INFO[rebaRiskLevel(preview.camera.reba)].color} expertColor={REBA_RISK_INFO[rebaRiskLevel(preview.expert.reba)].color}
              />
              <p className="md:col-span-2 text-[10px] text-muted-foreground font-mono">
                Experto · RULA: brazo {preview.expert.rulaComponents.upperArm}, antebrazo {preview.expert.rulaComponents.lowerArm},
                muñeca {preview.expert.rulaComponents.wrist}, giro {preview.expert.rulaComponents.wristTwist}, cuello {preview.expert.rulaComponents.neck},
                tronco {preview.expert.rulaComponents.trunk}, piernas {preview.expert.rulaComponents.legs} · REBA: tronco {preview.expert.rebaComponents.trunk},
                cuello {preview.expert.rebaComponents.neck}, piernas {preview.expert.rebaComponents.legs}, brazo {preview.expert.rebaComponents.upperArm},
                antebrazo {preview.expert.rebaComponents.lowerArm}, muñeca {preview.expert.rebaComponents.wrist}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-red-400">Corrige los ángulos marcados para ver el resultado.</p>
          )}

          {/* Datos de la revisión */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="block text-xs">
              <span className={label}>Revisó (obligatorio)</span>
              <input value={reviewer} onChange={e => setReviewer(e.target.value)} className="input-glass mt-0.5 text-xs" placeholder="Nombre del ergónomo" />
            </label>
            <label className="block text-xs">
              <span className={label}>Fecha</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-glass mt-0.5 text-xs" />
            </label>
            <label className="block text-xs">
              <span className={label}>Puesto</span>
              <input value={puesto} onChange={e => setPuesto(e.target.value)} className="input-glass mt-0.5 text-xs" placeholder="Opcional" />
            </label>
            <label className="block text-xs sm:col-span-3">
              <span className={label}>Nota</span>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="input-glass mt-0.5 text-xs" placeholder="Qué observó en persona y por qué corrigió" />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={!preview} className="btn-primary-glass flex items-center gap-1.5 text-xs disabled:opacity-40">
              <Save className="w-3.5 h-3.5" /> Guardar revisión
            </button>
            <button onClick={() => { setDraft(toDraft(captured.measured)); setFactors(DEFAULT_FACTORS); }} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
              <RotateCcw className="w-3.5 h-3.5" /> Restablecer a la cámara
            </button>
            <button onClick={discard} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
          </div>
        </div>
      )}

      <ValidationSummary dataset={dataset} onChange={setDataset} />
    </div>
  );
};

export default ExpertReviewPanel;
