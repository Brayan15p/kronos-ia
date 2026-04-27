import React from 'react';
import { VirtualObjectType } from './types';
import { Box, Wrench, Cpu, Monitor, Circle, Hammer, Settings, Zap, Layers, ToggleLeft } from 'lucide-react';

interface Props {
  selected: VirtualObjectType;
  onChange: (v: VirtualObjectType) => void;
  hasHand: boolean;
}

const OBJECTS: { id: VirtualObjectType; label: string; icon: React.ElementType; desc: string; color: string; category: string }[] = [
  { id: 'none',          label: 'Sin objeto',      icon: Circle,      desc: 'Solo análisis',                   color: '#64748b', category: 'Base' },
  { id: 'caja',          label: 'Caja',             icon: Box,         desc: 'Manipulación de carga',           color: '#22d3ee', category: 'Logística' },
  { id: 'herramienta',   label: 'Herramienta',      icon: Wrench,      desc: 'Herramienta genérica',            color: '#f59e0b', category: 'Herramientas' },
  { id: 'martillo',      label: 'Martillo',         icon: Hammer,      desc: 'Impacto y golpeo',                color: '#fb923c', category: 'Herramientas' },
  { id: 'destornillador',label: 'Destornillador',   icon: Settings,    desc: 'Ensamblaje con tornillos',        color: '#e879f9', category: 'Herramientas' },
  { id: 'tornillo',      label: 'Tornillo',         icon: Zap,         desc: 'Elemento de fijación',            color: '#a3e635', category: 'Componentes' },
  { id: 'componente',    label: 'Componente',       icon: Cpu,         desc: 'Pieza de ensamblaje',             color: '#818cf8', category: 'Componentes' },
  { id: 'pcb',           label: 'PCB',              icon: Layers,      desc: 'Placa de circuito impreso',       color: '#34d399', category: 'Componentes' },
  { id: 'engranaje',     label: 'Engranaje',        icon: Settings,    desc: 'Transmisión mecánica',            color: '#fbbf24', category: 'Mecánica' },
  { id: 'palanca',       label: 'Palanca',          icon: ToggleLeft,  desc: 'Control de proceso',              color: '#60a5fa', category: 'Control' },
  { id: 'pantalla',      label: 'Pantalla',         icon: Monitor,     desc: 'Interfaz digital',                color: '#34d399', category: 'Digital' },
  { id: 'boton',         label: 'Botón',            icon: Circle,      desc: 'Accionamiento puntual',           color: '#f43f5e', category: 'Control' },
];

const categories = [...new Set(OBJECTS.map(o => o.category))];

const VirtualObjectSim: React.FC<Props> = ({ selected, onChange, hasHand }) => {
  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-sm text-foreground">Objeto Virtual</h3>
        </div>
        {selected !== 'none' && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: hasHand ? '#34d399' : '#f43f5e', boxShadow: `0 0 8px ${hasHand ? '#34d399' : '#f43f5e'}` }} />
            <span className="text-xs text-muted-foreground">{hasHand ? 'Anclado a mano' : 'Sin mano'}</span>
          </div>
        )}
      </div>

      <div className="space-y-3 max-h-72 overflow-y-auto scroll-thin pr-1">
        {categories.map(cat => (
          <div key={cat}>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5 px-0.5">{cat}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {OBJECTS.filter(o => o.category === cat).map(obj => {
                const Icon = obj.icon;
                const active = selected === obj.id;
                return (
                  <button
                    key={obj.id}
                    onClick={() => onChange(obj.id)}
                    className="flex items-center gap-2 p-2 rounded-lg text-left transition-all duration-200 hover:scale-[1.02]"
                    style={{
                      background: active ? obj.color + '16' : 'rgba(255,255,255,0.025)',
                      border: `1px solid ${active ? obj.color + '50' : 'rgba(255,255,255,0.06)'}`,
                      boxShadow: active ? `0 0 14px -5px ${obj.color}66` : 'none',
                    }}
                  >
                    <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: active ? obj.color + '28' : 'rgba(255,255,255,0.04)' }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: active ? obj.color : '#475569' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: active ? obj.color : '#e2e8f0' }}>{obj.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{obj.desc}</p>
                    </div>
                    {active && <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: obj.color }} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected !== 'none' && (
        <div className="p-2.5 rounded-lg text-xs text-center" style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)' }}>
          <p className="text-primary font-semibold">Objeto renderizado sobre tu mano en el video</p>
          <p className="text-muted-foreground mt-0.5">El tamaño se adapta a la apertura de los dedos</p>
        </div>
      )}
    </div>
  );
};

export default VirtualObjectSim;
