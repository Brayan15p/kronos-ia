

# Plan: Modulos de Ergonomia Ambiental + Modelo 3D -- KRONOS.AI

## Resumen Ejecutivo

Crear un ecosistema de modulos de **Seguridad y Salud en el Trabajo (SST)** que mida luz (lux) y sonido (dB) en estaciones de trabajo, con un modelo 3D interactivo del puesto de trabajo, recomendaciones con IA, y traduccion de riesgos ergonomicos a costos economicos.

---

## Modulos a Crear

### 1. Modulo de Medicion Ambiental (`EnvironmentalModule.tsx`)
- Registro manual de mediciones de **luz (lux)** y **sonido (dB)** por operario y por zona
- Historico de mediciones con timestamps
- Indicadores de cumplimiento normativo (Resolucion 2400 Colombia: 300-500 lux trabajo fino, <85 dB 8h)
- Semaforo visual: verde/amarillo/rojo segun norma
- Graficos de tendencia por operario y por turno

### 2. Modelo 3D del Puesto de Trabajo (`Workspace3DModel.tsx`)
- Escena 3D con **@react-three/fiber v8** y **@react-three/drei v9** (compatibles con React 18)
- Modelo de mesa + operario sentado + grulla en proceso
- **Puntos de medicion interactivos** (esferas clickeables) donde el usuario puede:
  - Colocar nuevos puntos arrastrando sobre la escena
  - Asignar valores de lux y dB a cada punto
  - Ver tooltip con los valores al hacer hover
- Mapa de calor visual (colores en el piso/mesa segun niveles)
- Soporte para multiples operarios (cambiar entre estaciones)
- Controles de camara (orbitar, zoom)

### 3. Dashboard SST (`SSTDashboard.tsx`)
- KPIs: promedio lux, promedio dB, % cumplimiento normativo, riesgo acumulado
- Graficos con recharts: tendencia temporal, comparativa entre operarios, distribucion por zona
- Alertas automaticas cuando se exceden limites

### 4. Analisis de Costos Ergonomicos (`ErgonomicCostAnalysis.tsx`)
- Traduccion de riesgos a costos:
  - Costo de ausentismo por enfermedad laboral (hipoacusia, fatiga visual)
  - Costo de EPP adicional requerido
  - Costo de adecuacion del puesto (lamparas, paneles acusticos)
  - ROI de mejoras ergonomicas
- Proyeccion mensual/anual de perdidas por incumplimiento

### 5. Recomendaciones con IA (`SSTRecommendations.tsx`)
- Edge function que usa Lovable AI (gemini-3-flash-preview) para analizar datos de luz/sonido
- Genera recomendaciones especificas:
  - Redistribucion de luminarias
  - Rotacion de operarios
  - Equipos de proteccion personal
  - Rediseno del layout
- Incluye estimacion de costo de implementacion vs ahorro

---

## Cambios Tecnicos

### Dependencias nuevas
- `@react-three/fiber@^8.18.0` -- motor 3D para React
- `@react-three/drei@^9.122.0` -- helpers (OrbitControls, Text, etc.)
- `three@^0.170.0` -- libreria base

### Context (`TimeStudyContext.tsx`)
- Agregar interfaces: `EnvironmentalReading`, `MeasurementPoint3D`, `WorkstationConfig`
- Agregar estado y funciones: `readings[]`, `addReading()`, `measurementPoints[]`, `addMeasurementPoint()`

### Navegacion (`Index.tsx`)
- Nueva categoria "Ergonomia" en sidebar con los modulos:
  - Ambiente (luz/sonido)
  - Modelo 3D
  - Dashboard SST
  - Costos Ergonomicos
  - IA SST

### Edge Function (`supabase/functions/sst-recommendations/index.ts`)
- Recibe datos ambientales, los analiza con Lovable AI
- Retorna recomendaciones estructuradas con costos estimados

---

## Normativa de Referencia (integrada en logica)
| Factor | Limite Colombia | Fuente |
|--------|----------------|--------|
| Iluminacion trabajo fino | 300-500 lux | Res. 2400/1979 |
| Ruido 8h | 85 dB | Res. 1792/1990 |
| Ruido 4h | 90 dB | Res. 1792/1990 |
| Ruido 2h | 95 dB | Res. 1792/1990 |

---

## Orden de Implementacion
1. Context + interfaces de datos ambientales
2. Modulo de medicion ambiental (formularios + graficos)
3. Modelo 3D con puntos interactivos
4. Dashboard SST
5. Analisis de costos ergonomicos
6. Edge function + modulo de recomendaciones IA
7. Integracion en sidebar

Confirma con **OK** para proceder con la implementacion.

