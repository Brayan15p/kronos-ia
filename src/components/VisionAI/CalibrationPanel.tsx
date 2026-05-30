import React from 'react';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { ClassifierConfig, DEFAULT_CLASSIFIER_CONFIG } from './types';

interface Props {
  config: ClassifierConfig;
  onChange: (c: ClassifierConfig) => void;
}

interface SliderDef {
  key: keyof ClassifierConfig;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  /** Optional formatter for the displayed value. */
  format?: (v: number) => string;
}

const SLIDERS: SliderDef[] = [
  {
    key: 'gripThreshold',
    label: 'Sensibilidad de agarre',
    help: 'Qué tan cerrada debe estar la mano para contar como agarre. Más bajo = detecta agarres con menos flexión.',
    min: 0.3, max: 0.8, step: 0.01,
    format: v => v.toFixed(2),
  },
  {
    key: 'motionThreshold',
    label: 'Sensibilidad de movimiento',
    help: 'Velocidad mínima de la mano para considerar que se mueve. Más bajo = detecta movimientos sutiles.',
    min: 0.002, max: 0.03, step: 0.001,
    format: v => v.toFixed(3),
  },
  {
    key: 'debounceFrames',
    label: 'Frames de estabilización',
    help: 'Frames consecutivos antes de confirmar un therblig. Más alto = lecturas más estables, menos ruido.',
    min: 1, max: 20, step: 1,
    format: v => `${v} frames`,
  },
  {
    key: 'decisionDelayMs',
    label: 'Tiempo de decisión',
    help: 'El modelo espera este tiempo sosteniendo el mismo gesto antes de decidir. Más alto = decisiones más lentas, deliberadas y confiables.',
    min: 0, max: 1200, step: 50,
    format: v => `${v} ms`,
  },
  {
    key: 'criticality',
    label: 'Criticidad del análisis',
    help: 'Rigor con que se juzga el trabajo. Más alto = el modelo es más exigente y detecta antes el desperdicio (esperas, retenciones, búsquedas).',
    min: 0.5, max: 2, step: 0.05,
    format: v => `${v.toFixed(2)}×`,
  },
  {
    key: 'rulaStrictness',
    label: 'Rigor RULA',
    help: 'Severidad de la evaluación postural. Más alto = penaliza posturas con mayor facilidad.',
    min: 0.5, max: 2, step: 0.1,
    format: v => `${v.toFixed(1)}×`,
  },
  {
    key: 'drowsyEAR',
    label: 'Umbral de somnolencia (EAR)',
    help: 'Apertura ocular bajo la cual se marca fatiga. Más alto = alerta antes de que el ojo se cierre del todo.',
    min: 0.12, max: 0.32, step: 0.01,
    format: v => v.toFixed(2),
  },
];

const ACCENT = '#22d3ee';

const CalibrationPanel: React.FC<Props> = ({ config, onChange }) => {
  const setKey = (key: keyof ClassifierConfig, value: number) => {
    onChange({ ...config, [key]: value });
  };

  const reset = () => onChange({ ...DEFAULT_CLASSIFIER_CONFIG });

  const isDefault = (Object.keys(DEFAULT_CLASSIFIER_CONFIG) as (keyof ClassifierConfig)[])
    .every(k => config[k] === DEFAULT_CLASSIFIER_CONFIG[k]);

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-accent" />
        <h3 className="font-display font-bold text-sm text-foreground">Calibración del clasificador</h3>
        <button
          onClick={reset}
          disabled={isDefault}
          className="btn-secondary-glass ml-auto flex items-center gap-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Restablecer
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Ajusta los umbrales de detección para mejorar la toma de datos en tu puesto de trabajo.
      </p>

      <div className="space-y-3.5">
        {SLIDERS.map(s => {
          const value = config[s.key];
          const display = s.format ? s.format(value) : String(value);
          return (
            <div key={s.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-foreground">{s.label}</label>
                <span className="text-xs font-mono text-accent tabular-nums">{display}</span>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={value}
                onChange={e => setKey(s.key, Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.08]"
                style={{ accentColor: ACCENT }}
              />
              <p className="text-[11px] leading-snug text-muted-foreground">{s.help}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CalibrationPanel;
