/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { VisionSession, EmotionState } from './types';
import { THERBLIG_INFO, EMOTION_INFO, downloadCSV } from './utils';
import { confidenceLevel } from './ergonomics';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { lastTableY } from '@/lib/pdf';
import SaveEvaluationButton from '@/components/SGSST/SaveEvaluationButton';

interface Props {
  session: VisionSession;
  operatorName?: string;
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('es-CO');
}

const VisionReport: React.FC<Props> = ({ session, operatorName = 'Operario' }) => {
  const durationMs = (session.endTime || Date.now()) - session.startTime;
  const totalTherbligMs = session.therbligs.reduce((s, e) => s + e.duration, 0) || 1;
  const effMs = session.therbligs.filter(e => THERBLIG_INFO[e.type]?.efficient).reduce((s, e) => s + e.duration, 0);
  const effPct = Math.round((effMs / totalTherbligMs) * 100);

  const avgEmotion = session.snapshots.length
    ? Math.round(session.snapshots.reduce((s, e) => s + e.emotionScore, 0) / session.snapshots.length)
    : 0;
  const avgRula = session.snapshots.length
    ? (session.snapshots.reduce((s, e) => s + e.rula, 0) / session.snapshots.length).toFixed(1)
    : '—';
  // REBA y confianza solo existen en muestras recientes: se promedian las que los tienen.
  const rebaVals = session.snapshots.map(s => s.reba).filter((v): v is number => typeof v === 'number');
  const avgReba = rebaVals.length ? (rebaVals.reduce((a, b) => a + b, 0) / rebaVals.length).toFixed(1) : '—';
  const confVals = session.snapshots.map(s => s.ergoConfidence).filter((v): v is number => typeof v === 'number');
  const avgConfNum = confVals.length ? confVals.reduce((a, b) => a + b, 0) / confVals.length : null;
  const avgConf = avgConfNum == null ? '—' : `${Math.round(avgConfNum * 100)}% (${confidenceLevel(avgConfNum)})`;
  const avgEar = session.snapshots.length
    ? (session.snapshots.reduce((s, e) => s + e.ear, 0) / session.snapshots.length).toFixed(2)
    : '—';

  const exportPDF = () => {
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(0, 210, 238);
    doc.text('KRONOS VISION AI — Reporte de Sesión', pw / 2, 18, { align: 'center' });
    doc.setFontSize(9);
    doc.setTextColor(120, 130, 140);
    doc.text(`Operario: ${operatorName}  ·  ${fmtDate(session.startTime)}  ·  Duración: ${fmtTime(durationMs)}`, pw / 2, 26, { align: 'center' });

    let y = 36;

    // Summary KPIs
    doc.setFontSize(13);
    doc.setTextColor(60, 60, 70);
    doc.text('Resumen Ejecutivo', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Indicador', 'Valor']],
      body: [
        ['Eficiencia Therbligs', `${effPct}%`],
        ['Bienestar promedio', `${avgEmotion}%`],
        ['Score RULA promedio (1–7)', avgRula],
        ['Score REBA promedio (1–15)', avgReba],
        ['Confianza ergonómica promedio', avgConf],
        ['EAR promedio (ojos)', avgEar],
        ['Total eventos Therblig', session.therbligs.length.toString()],
        ['Duración sesión', fmtTime(durationMs)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [0, 180, 210] },
      styles: { fontSize: 9 },
    });
    y = lastTableY(doc) + 5;

    // Aviso de alcance de la ergonomía por cámara
    doc.setFontSize(7.5);
    doc.setTextColor(120, 130, 140);
    const ergoNote = doc.splitTextToSize(
      'Ergonomía estimada con una sola cámara (RULA y REBA): es un tamizaje, no una evaluación ergonómica normativa. ' +
      'Confírmala con un evaluador cuando la confianza sea baja. La vista lateral (perfil) da mediciones más fiables. ' +
      'RULA (McAtamney y Corlett, 1993) asume giro de muñeca en rango medio, piernas apoyadas, uso muscular y carga = 0; ' +
      'REBA (Hignett y McAtamney, 2000) asume carga, agarre y actividad = 0. Ambos supuestos pueden subestimar el riesgo.',
      pw - 28,
    );
    doc.text(ergoNote, 14, y);
    y += ergoNote.length * 3.5 + 6;

    // Therbligs table
    const byType: Record<string, number> = {};
    session.therbligs.forEach(e => { byType[e.type] = (byType[e.type] || 0) + e.duration; });
    const therbligRows = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, ms]) => [
        type,
        THERBLIG_INFO[type]?.label || type,
        THERBLIG_INFO[type]?.efficient ? 'Eficiente' : 'Ineficiente',
        fmtTime(ms),
        `${Math.round((ms / totalTherbligMs) * 100)}%`,
      ]);

    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.setTextColor(60, 60, 70);
    doc.text('Análisis de Therbligs', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Código', 'Descripción', 'Tipo', 'Tiempo', '% del total']],
      body: therbligRows,
      theme: 'striped',
      headStyles: { fillColor: [0, 180, 210] },
      styles: { fontSize: 8 },
    });
    y = lastTableY(doc) + 10;

    // Emotion timeline (samples)
    if (session.snapshots.length > 0) {
      if (y > 200) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.setTextColor(60, 60, 70);
      doc.text('Muestras de Sesión (cada 5 s)', 14, y);
      y += 6;
      const sampleStep = Math.max(1, Math.floor(session.snapshots.length / 20));
      const samples = session.snapshots.filter((_, i) => i % sampleStep === 0);
      autoTable(doc, {
        startY: y,
        head: [['Tiempo', 'Emoción', 'Bienestar', 'RULA', 'REBA', 'Confianza', 'EAR', 'Therblig']],
        body: samples.map(s => [
          fmtTime(s.timestamp - session.startTime),
          EMOTION_INFO[s.emotion]?.label || s.emotion,
          `${s.emotionScore}%`,
          s.rula.toString(),
          s.reba != null ? s.reba.toString() : '—',
          s.ergoConfidence != null ? `${Math.round(s.ergoConfidence * 100)}%` : '—',
          s.ear.toFixed(2),
          s.therblig || '—',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [0, 180, 210] },
        styles: { fontSize: 7 },
      });
    }

    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('Generado por KRONOS.AI — Vision Intelligence Platform', pw / 2, 290, { align: 'center' });
    doc.save(`kronos_vision_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportCSV = () => {
    downloadCSV(
      `kronos_vision_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Tiempo', 'Emocion', 'Bienestar', 'RULA', 'REBA', 'Confianza ergonomica', 'EAR', 'Therblig', 'Timestamp'],
      session.snapshots.map(s => [
        fmtTime(s.timestamp - session.startTime),
        EMOTION_INFO[s.emotion]?.label || s.emotion,
        s.emotionScore,
        s.rula,
        s.reba ?? '',
        s.ergoConfidence != null ? s.ergoConfidence.toFixed(2) : '',
        s.ear.toFixed(3),
        s.therblig || '',
        fmtDate(s.timestamp),
      ])
    );
  };

  const canExport = session.snapshots.length > 0 || session.therbligs.length > 0;

  return (
    <div className="glass-card p-4 space-y-3">
      <h3 className="font-display font-bold text-sm text-foreground">Exportar Sesión</h3>

      {canExport ? (
        <>
          <div className="grid grid-cols-2 gap-2 text-center">
            {[
              { label: 'Eficiencia', value: `${effPct}%`, color: effPct >= 70 ? '#34d399' : effPct >= 40 ? '#fbbf24' : '#f43f5e' },
              { label: 'Bienestar', value: `${avgEmotion}%`, color: '#818cf8' },
              { label: 'RULA prom.', value: avgRula, color: '#22d3ee' },
              { label: 'REBA prom.', value: avgReba, color: '#22d3ee' },
              { label: 'Confianza ergo.', value: avgConfNum == null ? '—' : `${Math.round(avgConfNum * 100)}%`, color: '#94a3b8' },
              { label: 'Duración', value: fmtTime(durationMs), color: '#94a3b8' },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-mono font-bold" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={exportPDF} className="btn-primary-glass flex-1 flex items-center justify-center gap-1.5 text-xs">
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </button>
            <button onClick={exportCSV} className="btn-secondary-glass flex-1 flex items-center justify-center gap-1.5 text-xs">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
          <SaveEvaluationButton session={session} />
        </>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-3">Inicia una sesión para habilitar el exportador.</p>
      )}
    </div>
  );
};

export default VisionReport;
