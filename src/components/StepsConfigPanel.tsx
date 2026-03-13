import React, { useState } from "react";
import { Plus, Trash2, Edit2, Check, X, Settings2 } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";

const EMOJI_OPTIONS = ["✂️", "📐", "🔲", "🔺", "🔻", "🌸", "🦢", "🪶", "👑", "🕊️", "⚙️", "🔧", "📏", "🎯", "🔩", "📦", "🧪", "✅"];

const StepsConfigPanel: React.FC = () => {
  const { steps, addStep, removeStep, updateStep } = useTimeStudy();
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("⚙️");
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) return;
    addStep(newName.trim(), newEmoji);
    setNewName("");
    setNewEmoji("⚙️");
  };

  const startEdit = (step: { number: number; name: string; emoji: string }) => {
    setEditingStep(step.number);
    setEditName(step.name);
    setEditEmoji(step.emoji);
  };

  const saveEdit = () => {
    if (editingStep === null || !editName.trim()) return;
    updateStep(editingStep, editName.trim(), editEmoji);
    setEditingStep(null);
  };

  return (
    <div className="glass-card p-5 space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Settings2 className="w-5 h-5 text-primary" />
        <div>
          <p className="text-sm font-display font-bold text-foreground">Configurar Pasos del Proceso</p>
          <p className="text-xs text-muted-foreground">Agrega, edita o elimina pasos. Actualmente: {steps.length} pasos</p>
        </div>
      </div>

      <div className="space-y-1 max-h-72 overflow-y-auto scroll-thin">
        {steps.map((step) => (
          <div key={step.number} className="flex items-center gap-2 py-1.5 px-3 rounded bg-muted/20 group">
            {editingStep === step.number ? (
              <>
                <select
                  value={editEmoji}
                  onChange={(e) => setEditEmoji(e.target.value)}
                  className="bg-muted/40 text-lg w-10 rounded border border-border/30 text-center"
                >
                  {EMOJI_OPTIONS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="input-glass flex-1 text-xs py-1"
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                />
                <button onClick={saveEdit} className="text-success hover:text-success/80 p-1"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditingStep(null)} className="text-muted-foreground hover:text-foreground p-1"><X className="w-3.5 h-3.5" /></button>
              </>
            ) : (
              <>
                <span className="text-lg w-7 text-center">{step.emoji}</span>
                <span className="text-xs text-muted-foreground font-mono w-6">#{step.number}</span>
                <span className="text-xs text-foreground flex-1">{step.name}</span>
                <button onClick={() => startEdit(step)} className="text-muted-foreground hover:text-primary p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Edit2 className="w-3 h-3" />
                </button>
                <button onClick={() => removeStep(step.number)} className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-end">
        <select
          value={newEmoji}
          onChange={(e) => setNewEmoji(e.target.value)}
          className="bg-muted/40 text-lg w-10 h-9 rounded border border-border/30 text-center"
        >
          {EMOJI_OPTIONS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nombre del nuevo paso..."
          className="input-glass flex-1 text-xs"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button onClick={handleAdd} disabled={!newName.trim()} className="btn-primary-glass flex items-center gap-1 text-xs disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" /> Agregar
        </button>
      </div>
    </div>
  );
};

export default StepsConfigPanel;
