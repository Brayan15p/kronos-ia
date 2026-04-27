import React, { useState } from 'react';
import { Shield, FileDown, FileSpreadsheet, CheckCircle, Clock } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadCSV } from '../VisionAI/utils';

interface Props {
  companyName?: string;
  oee: number;
  dailyLoss: number;
  rulaAvg: number;
  efficiency: number;
  daysWithoutAccident: number;
  complianceRate: number;
  readings: { zone: string; lux: number; db: number; operatorName: string; timestamp: number }[];
}

const REQUIREMENTS = [
  { code: '4.1', title: 'Comprensión de la organización', status: 'ok' as const },
  { code: '5.1', title: 'Liderazgo y participación', status: 'ok' as const },
  { code: '6.1', title: 'Identificación de peligros y riesgos', status: 'ok' as const },
  { code: '6.2', title: 'Objetivos SST y planificación', status: 'ok' as const },
  { code: '7.4', title: 'Comunicación y participación', status: 'warn' as const },
  { code: '8.1', title: 'Controles operacionales', status: 'ok' as const },
  { code: '9.1', title: 'Monitoreo, medición y análisis', status: 'ok' as const },
  { code: '10.2', title: 'Incidentes, no conformidades', status: 'ok' as const },
];

const CertificationExport: React.FC<Props> = ({
  companyName = 'Mi Empresa',
  oee, dailyLoss, rulaAvg, efficiency, daysWithoutAccident, complianceRate, readings,
}) => {
  const [generating, setGenerating] = useState(false);
  const okCount = REQUIREMENTS.filter(r => r.status === 'ok').length;
  const readyPct = Math.round((okCount / REQUIREMENTS.length) * 100);

  const exportPDF = async () => {
    setGenerating(true);
    await new Promise(r => setTimeout(r, 200));
    try {
      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth();
      const date = new Date().toLocaleDateString('es-CO');

      // Cover
      doc.setFillColor(8, 8, 26);
      doc.rect(0, 0, pw, 297, 'F');
      doc.setFontSize(22); doc.setTextColor(0, 210, 238);
      doc.text('PAQUETE DE CERTIFICACIÓN', pw / 2, 40, { align: 'center' });
      doc.setFontSize(16); doc.setTextColor(129, 140, 248);
      doc.text('ISO 45001:2018 / OHSAS 18001', pw / 2, 52, { align: 'center' });
      doc.setFontSize(11); doc.setTextColor(180, 180, 200);
      doc.text(companyName, pw / 2, 65, { align: 'center' });
      doc.text(`Generado: ${date} — Por KRONOS.AI`, pw / 2, 73, { align: 'center' });
      doc.setFontSize(40); doc.setTextColor(0, 210, 238);
      doc.text(`${readyPct}%`, pw / 2, 120, { align: 'center' });
      doc.setFontSize(12); doc.setTextColor(180, 180, 200);
      doc.text('Preparación para certificación', pw / 2, 132, { align: 'center' });

      // Page 2 - KPI Summary
      doc.addPage();
      doc.setFillColor(15, 15, 30); doc.rect(0, 0, pw, 297, 'F');
      doc.setFontSize(16); doc.setTextColor(0, 210, 238);
      doc.text('1. Indicadores Clave de Desempeño', 14, 20);
      autoTable(doc, {
        startY: 28,
        head: [['Indicador', 'Valor', 'Objetivo', 'Estado']],
        body: [
          ['OEE', `${oee}%`, '≥85%', oee >= 85 ? '✅ Cumple' : '⚠️ Mejorar'],
          ['Score RULA promedio', rulaAvg.toFixed(1), '≤3', rulaAvg <= 3 ? '✅ Cumple' : '⚠️ Revisar'],
          ['Eficiencia Therbligs', `${efficiency}%`, '≥70%', efficiency >= 70 ? '✅ Cumple' : '⚠️ Mejorar'],
          ['Días sin accidente', daysWithoutAccident.toString(), '≥30', daysWithoutAccident >= 30 ? '✅ Cumple' : '⚠️ Mejorar'],
          ['Cumplimiento ambiental', `${complianceRate.toFixed(0)}%`, '≥95%', complianceRate >= 95 ? '✅ Cumple' : '⚠️ Revisar'],
          ['Pérdida diaria estimada', `$${dailyLoss.toLocaleString('es-CO')} COP`, 'Mínima', '—'],
        ],
        headStyles: { fillColor: [0, 130, 160] },
        styles: { fontSize: 9, textColor: [220, 220, 230] },
        theme: 'striped',
      });

      // Page 3 - Requirements
      doc.addPage();
      doc.setFillColor(15, 15, 30); doc.rect(0, 0, pw, 297, 'F');
      doc.setFontSize(16); doc.setTextColor(0, 210, 238);
      doc.text('2. Verificación de Requisitos ISO 45001', 14, 20);
      autoTable(doc, {
        startY: 28,
        head: [['Cláusula', 'Requisito', 'Estado', 'Evidencia']],
        body: REQUIREMENTS.map(r => [
          r.code, r.title,
          r.status === 'ok' ? '✅ Cumple' : '⚠️ Revisar',
          r.status === 'ok' ? 'Registros KRONOS.AI' : 'Pendiente',
        ]),
        headStyles: { fillColor: [0, 130, 160] },
        styles: { fontSize: 8, textColor: [220, 220, 230] },
        theme: 'striped',
      });

      // Page 4 - Environmental readings
      if (readings.length > 0) {
        doc.addPage();
        doc.setFillColor(15, 15, 30); doc.rect(0, 0, pw, 297, 'F');
        doc.setFontSize(16); doc.setTextColor(0, 210, 238);
        doc.text('3. Registro de Mediciones Ambientales', 14, 20);
        autoTable(doc, {
          startY: 28,
          head: [['Operario', 'Zona', 'Lux', 'dB', 'Fecha', 'Norma']],
          body: readings.slice(0, 30).map(r => [
            r.operatorName, r.zone,
            r.lux.toString(), r.db.toString(),
            new Date(r.timestamp).toLocaleDateString('es-CO'),
            r.lux >= 300 && r.lux <= 1000 && r.db <= 85 ? '✅ Cumple' : '⚠️ Revisar',
          ]),
          headStyles: { fillColor: [0, 130, 160] },
          styles: { fontSize: 7, textColor: [220, 220, 230] },
          theme: 'striped',
        });
      }

      doc.setFontSize(7); doc.setTextColor(100, 100, 120);
      doc.text('KRONOS.AI — Industrial Intelligence Platform · Este documento es de carácter informativo', pw / 2, 290, { align: 'center' });
      doc.save(`kronos_iso45001_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  const exportCSV = () => {
    downloadCSV(
      `kronos_sst_certificacion_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Clausula', 'Requisito', 'Estado'],
      REQUIREMENTS.map(r => [r.code, r.title, r.status === 'ok' ? 'Cumple' : 'Revisar'])
    );
  };

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-accent" />
        <h3 className="font-display font-bold text-sm text-foreground">Paquete ISO 45001</h3>
      </div>

      {/* Readiness gauge */}
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg viewBox="0 0 64 64" className="w-full h-full">
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle cx="32" cy="32" r="26" fill="none" stroke="#818cf8" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${(readyPct / 100) * 163.4} 163.4`} transform="rotate(-90 32 32)"
              style={{ filter: 'drop-shadow(0 0 6px #818cf866)' }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-mono font-bold text-accent">{readyPct}%</span>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{okCount}/{REQUIREMENTS.length} requisitos</p>
          <p className="text-xs text-muted-foreground">preparados para auditoría</p>
        </div>
      </div>

      {/* Requirements list */}
      <div className="space-y-1.5 max-h-48 overflow-y-auto scroll-thin">
        {REQUIREMENTS.map(r => (
          <div key={r.code} className="flex items-center gap-2.5 text-xs">
            {r.status === 'ok'
              ? <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              : <Clock className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
            }
            <span className="font-mono text-muted-foreground w-8">{r.code}</span>
            <span className="text-foreground">{r.title}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={exportPDF}
          disabled={generating}
          className="btn-accent-glass flex-1 flex items-center justify-center gap-1.5 text-xs"
        >
          {generating
            ? <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
            : <FileDown className="w-3.5 h-3.5" />
          }
          PDF ISO 45001
        </button>
        <button onClick={exportCSV} className="btn-secondary-glass flex items-center justify-center gap-1.5 text-xs px-3">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          CSV
        </button>
      </div>
    </div>
  );
};

export default CertificationExport;
