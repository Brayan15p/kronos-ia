# Plan: Rediseño Premium SST + Zonas Configurables + Imagen Operario

## Resumen

Tres cambios principales: (1) zonas configurables para medir solo luz, solo sonido, o ambos; (2) reemplazar el modelo 3D con la imagen del operario como fondo interactivo; (3) adicion  y resieño de completo de la sección SST con estética remium enfocada en dinero y acción.

---

## 1. Zonas con tipo de medición configurable

**Archivo: `src/context/SSTContext.tsx**`

- Agregar campo `measureType: "lux" | "db" | "both"` a `ZoneConfig`
- Actualizar `DEFAULT_ZONES` con este campo

**Archivo: `src/components/EnvironmentalModule.tsx**`

- En el panel de configuración de zonas, agregar selector de tipo (Solo Luz / Solo Sonido / Ambos)
- En el formulario de registro, ocultar campos según el `measureType` de la zona seleccionada
- Ajustar cálculos y promedios para respetar el tipo

---

## 2. Reemplazar modelo 3D con imagen interactiva

**Archivo: `src/components/Workspace3DModel.tsx**`

- Copiar la imagen del operario a `src/assets/operario-origami.png`
- Reemplazar el Canvas 3D por una vista 2D con la imagen como fondo
- Mantener la funcionalidad de colocar puntos de medición sobre la imagen (click para poner punto, editar lux/dB)
- Puntos representados como círculos SVG/HTML superpuestos con colores de cumplimiento
- Mantener controles de editar/eliminar puntos

---

## 3. Rediseño Premium de la sección SST

Renombrar secciones en sidebar con nombres más atractivos y rediseñar los módulos:

### Nuevos nombres de secciones:


| Actual             | Nuevo            |
| ------------------ | ---------------- |
| Ambiente           | Radar Ambiental  |
| Modelo 3D          | Visión Operativa |
| Dashboard SST      | Centro de Mando  |
| Costos Ergonómicos | Fuga de Capital  |
| IA SST             | Motor IA         |


### Nuevo componente: Panel Hero de Pérdidas (dentro de SSTDashboard o nuevo)

- KPI grande: "$X perdidos hoy" con subtítulo "Recuperables: $Y"
- Indicador de tendencia
- Desglose por causas (Fatiga, Ruido, Ineficiencia) con barras
- Score de eficiencia circular (0-100) con gradiente rojo→amarillo→verde

### Motor de Decisiones IA (actualizar SSTRecommendations)

- Recomendaciones con impacto % y ganancia estimada en COP
- Cards con hover effects y iconos

### Panel de Alertas Inteligentes

- Tarjetas de alertas en tiempo real (fatiga, riesgo de error, etc.)
- Integrado en el dashboard principal

### Generación de Reportes PDF Premium

- Botón "Generar reporte inteligente" prominente
- PDF con logo KRONOS.AI, resumen ejecutivo, dinero perdido vs recuperable, score, riesgos, recomendaciones IA, gráficas

### Exportación Excel SST

- Botón "Exportar datos SST"
- Genera Excel con mediciones, datos por operario/zona, históricos

---

## Archivos a modificar/crear

1. `src/context/SSTContext.tsx` — agregar `measureType` a ZoneConfig
2. `src/components/Workspace3DModel.tsx` — reemplazar 3D por imagen interactiva
3. `src/components/SSTDashboard.tsx` — rediseño completo con Hero de Pérdidas, Score, Alertas
4. `src/components/SSTRecommendations.tsx` — rediseño como Motor de Decisiones
5. `src/components/ErgonomicCostAnalysis.tsx` — rediseño premium
6. `src/components/EnvironmentalModule.tsx` — selector de tipo de medición por zona
7. `src/pages/Index.tsx` — renombrar tabs SST
8. `src/components/PDFReport.tsx` — agregar sección SST premium al PDF
9. Copiar imagen operario a `src/assets/`

---

## Estética

- Mantener glassmorphism oscuro existente
- Cards con brillo sutil (box-shadow con cyan/violet glow)
- Números grandes para KPIs financieros
- Gradientes sutiles en indicadores
- Hover effects en tarjetas de recomendaciones
- Tipografía Space Grotesk consistente