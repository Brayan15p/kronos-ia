# Hoja de ruta de Kronos IA

Kronos IA es un proyecto de **Brayan Andrés Pedraza Céspedes**. Este documento ordena qué construir y por qué.
La evidencia (competidores, papers, canal ARL, precios) está en
[investigacion-mercado-y-estado-del-arte.md](investigacion-mercado-y-estado-del-arte.md).

**Tesis:** el cronómetro desaparece. Gana quien convierta el video de un celular en **tiempo estándar
y evaluación ergonómica defendibles**, en español y al precio de una pyme. Arriba el mercado se está
consolidando (Tulip, IFS–Poka, CAI–Parsable, Apple–Drishti) y casi nadie atiende a la pyme
latinoamericana de manufactura manual.

## Hecho (octubre 2026)

- Seguridad: endpoint de IA restringido a la propia app, historial validado y modelo configurable
  (`LLM_MODELS`); base de datos con acceso solo por usuario (migración `20261030_secure_rls.sql`).
- **Ciclos automáticos desde el esqueleto (v1):** se marca la posición inicial de las manos y cada salida
  y vuelta registra un ciclo, que se envía al estudio de tiempos.
- Plantillas de proceso (confección, ensamble electrónico, empaque, origami).
- Respaldo y restauración del estudio en archivo; confirmación antes de borrar.
- Navegación por tarea (Medir → Analizar → Mejorar → Reportar + SST) y carga de módulos bajo demanda.
- Análisis facial con interruptor y aviso de autorización.
- Tests de las matemáticas de Monte Carlo, del detector de ciclos, del respaldo y del endpoint de IA.

## Ahora (0–2 meses): de demo a producto que se puede cobrar

| # | Qué | Por qué | Esfuerzo |
|---|---|---|---|
| 1 | **Cuentas, organización → planta → estación**, roles y sincronización de métricas (sin video) en Supabase | Sin esto no hay cobro por estación ni canal de consultoras/ARL | M |
| 2 | **Validar los ciclos automáticos con un video real** y medir el error frente al cronómetro; v2 con ejemplo marcado + DTW para procesos sin posición inicial clara | Es la promesa central; hay que poder decir "error < 3 %" con datos | M |
| 3 | **Ergonomía con confianza**: semáforo de confianza por articulación, guía para grabar de lado, corrección manual del experto; añadir REBA | La ergonomía por una sola cámara sirve como tamizaje; mostrarlo honestamente la hace defendible ante un ergónomo o una ARL | S–M |
| 4 | **Paquete SG-SST Colombia**: PVE osteomuscular, fila de matriz GTC 45, lux/ruido y plan de acción en PDF/Excel | Habla el idioma del responsable SST y de la ARL | M |

## Siguiente (2–6 meses): más valor por planta

5. **Trabajo estándar (SOP) automático**: pasos con fotograma clave, tiempo estándar y puntos de calidad.
6. **Balanceo de línea y yamazumi** con el riesgo del Monte Carlo incluido.
7. **Curva de aprendizaje y matriz de competencias** por operario (base justa para incentivos).
8. **Detección de pasos omitidos o fuera de orden** (pasar de medir tiempo a prevenir defectos).
9. **IA en el navegador (WebLLM)** con base de conocimiento lean/SST; OpenRouter como respaldo.

## Después (6–18 meses): ventaja difícil de copiar

10. **Referencia anónima entre plantas** ("tu tiempo vs. la mediana del sector"): cada cliente mejora el producto.
11. **Tiempos predeterminados (MODAPTS) sugeridos desde los therbligs.**
12. **Integraciones** con producción y nómina (Odoo, Siigo) para pagar incentivos con datos medidos.
13. **Idiomas y monedas** (es/en/pt), empezando por Brasil y México.

## Decisiones tomadas

- **Privacidad por diseño:** el video se procesa en el dispositivo; a la nube solo van esqueleto y métricas.
  Es a la vez argumento de venta y requisito legal (Ley 1581; Ley de IA de la UE si se vende en Europa).
- **Análisis facial:** se mantiene con interruptor y aviso de autorización. Antes de vender en la UE,
  apagarlo por defecto o limitarlo a fatiga (parpadeo) con consentimiento.
- **Modelos de IA:** gratuitos por defecto para la demo; para clientes, modelos de pago vía `LLM_MODELS`.

## Hipótesis por validar (30 días)

- [ ] 5 entrevistas con ARL o consultoras SST: ¿pagan o cofinancian herramientas para sus empresas afiliadas?
- [ ] 5 jefes de producción de pymes: ¿cuánto pagarían por estación al mes? (hipótesis sin validar: COP 150–400k).
- [ ] Ciclos automáticos sobre un video real: error frente al cronómetro.
- [ ] Revisión de un profesional SST del mapeo a la Res. 0312 antes de usar "cumplimiento" en marketing.

**Señales para acelerar:** una ARL o consultora pide un piloto; una planta usa Kronos cada semana sin ayuda;
el error de los ciclos automáticos es menor al 3 %.
