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
- **Corrección del análisis de sensibilidad (Sobol):** el estimador anterior devolvía siempre 0, así que el
  "factor que más afecta la rentabilidad" era ruido. Ahora usa el estimador de Saltelli, validado contra la
  solución analítica (error < 0,015).
- 51 tests: matemáticas de Monte Carlo, detector de ciclos, respaldo y endpoint de IA.

### Hecho (31 octubre 2026)

- **Cuentas y nube:** organización → plantas → estudios, roles (administrador, editor, lector),
  equipo por correo y control de versión para que dos personas no se pisen. Probado con 21 pruebas
  de permisos en Postgres y un flujo completo en navegador. Pendiente: aplicar las migraciones en
  Supabase (ver README).
- Corrección: las fuentes de la marca (Space Grotesk, JetBrains Mono, Inter) no cargaban en producción.
- CI completo en GitHub: lint, tipos, tests, build y permisos de la base de datos.
- **Ergonomía con confianza:** confianza por segmento, guía para grabar de perfil y REBA.
- **Neon como base de datos** (Neon Auth + Data API) con el mismo esquema que Supabase; pruebas de
  permisos en ambos modos.
- **Paquete SG-SST Colombia:** evaluaciones ergonómicas guardadas desde Vision AI, matriz de
  peligros GTC 45:2012 prellenada (propuestas editables de ND/NE), mediciones de lux y ruido, plan
  de acción y PDF de evidencias + CSV para Excel. La dosis de ruido ahora usa el intercambio de
  5 dB de la Res. 1792/1990 (antes 3 dB).
- **Balanceo de línea y yamazumi:** takt, estaciones que de verdad cumplen el takt, reparto óptimo y
  riesgo por estación con Monte Carlo.
- **Curva de aprendizaje y matriz de competencias ILUO**, con alertas de dependencia de una sola persona.
- **Revisión del experto en ergonomía:** corrige ángulos y factores de RULA/REBA, queda en el paquete
  SG-SST (la matriz usa el valor del experto) y guarda los pares cámara vs experto para validar.
- **Gemelo digital "¿y si…?":** copia virtual de la línea con los tiempos medidos. Palancas por paso,
  variabilidad, demanda, turnos, estaciones y costos; compara producción, capacidad, riesgo de superar
  el takt, mano de obra por unidad y margen frente a la línea actual (Monte Carlo reproducible).
- **Pasos automáticos desde el video (beta):** en Vision AI se enseña el método una vez (el
  observador marca los pasos de un ciclo de referencia) y desde ahí cada ciclo detectado trae sus
  tiempos por paso y los pasos omitidos, alineando la trayectoria de las manos con DTW. En ciclos
  sintéticos: 0 omisiones falsas, 100 % de omisiones detectadas y 0,12 s de error por paso (ruido
  moderado). Falta validarlo con video real.
- **Secuencia del método (pasos omitidos o fuera de orden):** modo "Secuencia observada" en el
  cronómetro (el observador marca el paso real, con alertas en vivo de saltos y omisiones) y análisis
  por paso y por operario que mide si desviarse del método va con más defectos (prueba exacta de
  Fisher). El hallazgo entra al Copiloto de planta como oportunidad de calidad.
- **Copiloto de planta ("¿qué hago el lunes?"):** cruza tiempos, balanceo, calidad, competencias,
  Monte Carlo y SG-SST, y entrega oportunidades priorizadas: primero la seguridad (GTC 45 nivel I–II
  sin acción, dosis de ruido > 100 %, posturas críticas), luego el ahorro en pesos ÷ esfuerzo, sin
  contar dos veces el mismo ahorro. Cada cifra muestra cómo se calculó y su confianza; la explicación
  con IA es opcional y solo recibe la lista ya calculada y anonimizada.
- **Trabajo estándar (SOP) automático:** hoja del puesto con tiempo observado (mediana), valoración
  del ritmo, suplementos de la tabla de la OIT y tiempo estándar por paso; observaciones necesarias
  (±5 %, 95 %), puntos clave sugeridos de calidad (defectos e inspección), seguridad (RULA/REBA y
  GTC 45) y quién puede enseñar (ILUO), con PDF para firmar.
- **PDFs sin caracteres rotos:** flechas y símbolos que Helvetica no dibuja se reemplazan en todos los PDFs.
- **Corrección del RULA:** el cálculo anterior medía el brazo contra la línea de hombros y la muñeca
  contra la horizontal de la imagen, así que una postura neutral daba "riesgo alto" (5). Ahora sigue
  a McAtamney & Corlett (1993), con sus tablas A, B y C: la postura neutral da 1–2 (aceptable).

## Ahora (0–2 meses): de demo a producto que se puede cobrar

| # | Qué | Por qué | Esfuerzo |
|---|---|---|---|
| 2 | **Validar los ciclos y los pasos automáticos con un video real** y medir el error frente al cronómetro (el reconocimiento de pasos con DTW ya está; falta el dato real) | Es la promesa central; hay que poder decir "error < 3 %" con datos | M |
| 3b | **Validar contra un ergónomo en 10 puestos reales** con la revisión del experto (ya construida: guarda los pares cámara vs experto y calcula la concordancia) | Convierte el tamizaje en un dato defendible | S |
| 4b | **Revisión del paquete SG-SST por un profesional SST con licencia** (mapeo a GTC 45 y Res. 0312) antes de usarlo en ventas | Las propuestas de ND/NE son convención de Kronos, no de la guía | S |

## Siguiente (2–6 meses): más valor por planta

5. **Fotograma clave por paso en el trabajo estándar**, tomado del video de Vision AI.
8. **Pasos fuera de orden desde el video** y reconocimiento con más de una referencia por paso (variantes del método).
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
