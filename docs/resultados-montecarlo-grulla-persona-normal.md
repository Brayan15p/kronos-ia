# Resultados de simulación Monte Carlo — Grulla de origami hecha por una persona NO experta

### Corrida real del motor de KRONOS.AI con tiempos justificados a partir de evidencia web

---

> **Cómo se construyó este caso (nada al azar).** Cada valor de entrada está justificado con una fuente o una regla explícita; cada indicador de la Sección 4 fue **calculado ejecutando el algoritmo real** del módulo (porteo exacto de `src/workers/montecarlo.worker.ts`), con semilla fija `20260531` (reproducible). No se inventó ningún resultado.

- **Producto:** Grulla de origami · **Pasos:** 13
- **Perfil del operario:** persona **no experta** (sigue instrucciones, ya hizo unas pocas)
- **Distribución:** Beta-PERT · **Muestreo:** Quasi-Monte Carlo (Halton) · **Escenarios:** 20.000
- **Fecha:** 2026-05-31

---

## 1. Justificación de los tiempos (evidencia web)

La pregunta es: ¿cuánto tarda **una persona normal** (no experta) en hacer una grulla de origami? La evidencia recopilada en la web es consistente:

| Fuente | Tiempo reportado |
|---|---|
| The Daily Dabble | "Tus primeras grullas pueden tomar 10–12 minutos cada una" |
| Perorigamian / Craft Show Success | "Si eres nuevo, calcula unos 10 a 15 minutos" |
| Ideas2Live4 | Rango de principiante 10–30 min; baja a ~5 min con práctica |
| Origami.me | "~5 minutos una vez que dominas el pliegue" |

**Decisión justificada:** se adopta una **media de 600 s (10 minutos)** para el ciclo completo, que es el centro del rango documentado para una persona no experta que ya ha hecho algunas grullas (10–12 min las primeras, 10–15 min el primer intento). No es el experto (~3–5 min) ni el primer intento absoluto (hasta 30–45 min).

### 1.1. Reparto por complejidad (regla, no azar)

Los 600 s se reparten entre los 13 pasos en proporción a un **peso de complejidad** asignado según el número de pliegues y la precisión que exige cada paso del modelo tradicional (la base preliminar y los pliegues de pétalo son los más demandantes; el corte y la inspección, los más simples):

| # | Paso | Peso | Media (s) | Desv. est. (s) |
|---|------|----:|----------:|---------------:|
| 1 | Corte / preparación del papel | 4 | 28,0 | 6,1 |
| 2 | Primer pliegue diagonal | 3 | 21,5 | 4,1 |
| 3 | Segundo pliegue diagonal | 3 | 21,8 | 4,8 |
| 4 | Pliegue base cuadrada (base preliminar) | 9 | 65,7 | 15,0 |
| 5 | Pliegues laterales sup. (base pájaro) | 10 | 68,4 | 15,6 |
| 6 | Pliegue pétalo superior | 11 | 72,7 | 17,7 |
| 7 | Pliegues laterales inferiores | 10 | 72,9 | 16,4 |
| 8 | Pliegue pétalo inferior | 11 | 76,3 | 16,1 |
| 9 | Formación del cuello (pliegue inverso) | 7 | 46,0 | 9,2 |
| 10 | Formación de la cola (pliegue inverso) | 6 | 43,6 | 9,1 |
| 11 | Formación de la cabeza (pliegue inverso peq.) | 5 | 34,0 | 7,8 |
| 12 | Apertura de alas | 4 | 26,7 | 7,1 |
| 13 | Inspección / control de calidad | 3 | 21,3 | 5,8 |
| | **Total** | **86** | **599,0** | |

**Variabilidad:** se fija una desviación estándar del **22 % de la media por paso**, que representa la **inconsistencia típica de una persona no entrenada** (un experto tendría un CV mucho menor, ~5–8 %). Esto tampoco es arbitrario: es el rasgo que distingue a un operario normal de uno calificado.

Con esta regla se generaron **30 ciclos cronometrados** (semilla fija), de los que el módulo extrae la muestra base:

| Estadístico de la muestra base (n = 30) | Valor |
|---|---:|
| Media del ciclo | **599,0 s (≈ 10,0 min)** |
| Desviación estándar | **38,4 s** |
| Mínimo observado | 524,5 s (8,7 min) |
| Máximo observado | 673,5 s (11,2 min) |

---

## 2. Los 3 parámetros iniciales (y por qué cada valor)

El módulo de Monte Carlo se alimenta de tres parámetros de negocio, además del costo de mano de obra. Cada uno está justificado:

| Parámetro | Valor elegido | Justificación |
|---|---:|---|
| **① Tiempo objetivo (USL)** | **720 s (12 min)** | Es una **cuota de productividad**: un turno de 8 h = 28.800 s; a 720 s por grulla se producen **40 grullas/turno**. Además, 720 s es el tope del rango "principiante" reportado en la web (10–12 min), por lo que es una meta exigente pero alcanzable para una persona no experta. |
| **② Valor por unidad** | **$6.000** | Precio de mercado de una grulla de origami decorativa hecha a mano (artesanía), coherente con el rango de $1–3 USD por pieza. |
| **③ Volumen mensual** | **880 unidades** | Capacidad mensual con la cuota anterior: 40 grullas/día × 22 días hábiles ≈ 880. |
| (Costo de mano de obra) | **$10.000 / hora** | **Salario mínimo colombiano 2025** ($1.423.500/mes) + auxilio de transporte ($200.000) + **factor prestacional ~1,5**, sobre ~235 horas/mes ≈ $10.000/h. |

> **Por qué el objetivo de 720 s y no la media de 600 s.** En capacidad de proceso, el objetivo es el **límite de especificación**, no el promedio. Fijarlo en la cuota de negocio (720 s) permite responder la pregunta gerencial real: *"¿una persona normal alcanza la cuota de 40 grullas por turno de forma confiable?"*

---

## 3. Por qué se eligió la distribución Beta-PERT

Los **tiempos de tarea humana son asimétricos a la derecha**: una persona puede tardar mucho más que su mejor marca (un pliegue mal hecho, una pausa), pero no puede ser arbitrariamente más rápida. La distribución **Beta-PERT** —introducida por Malcolm, Roseboom, Clark y Fazar (1959) precisamente para tiempos de actividad— captura esa asimetría con tres puntos (mínimo, modal, máximo) y da cuatro veces más peso al valor más probable. Por eso es la distribución elegida para el muestreo.

La prueba de Anderson–Darling (Sección 4.4) confirma además un fenómeno teórico esperado: al **sumar 13 pasos**, el tiempo total tiende a la **normalidad** por el Teorema del Límite Central, aunque cada paso individual sea asimétrico.

---

## 4. Resultados (calculados por el algoritmo real)

### 4.1. Distribución del tiempo de ciclo

| Métrica | Valor |
|---|---:|
| Media simulada | **599,0 s (10,0 min)** |
| Desviación estándar | 28,0 s |
| Coeficiente de variación | 4,67 % |
| Percentil 5 | 552,7 s (9,2 min) |
| Mediana (P50) | 599,0 s |
| Percentil 95 | 645,4 s (10,8 min) |
| IC 95 % de la media | [598,6 ; 599,4] s |

### 4.2. Probabilidad de cumplir la cuota

| Métrica | Valor |
|---|---:|
| **P(ciclo ≤ 720 s)** | **100,0 %** |
| DPMO empírico | **0** |

> El cumplimiento es del 100 % porque la PERT tiene soporte acotado en [524 ; 673] s: ni el peor escenario simulado (673 s) llega a los 720 s de la cuota. **Una persona normal alcanza la cuota de 40 grullas/turno en todos los ciclos.**

### 4.3. Capacidad de proceso

| Índice | Valor | Lectura |
|---|---:|---|
| C_p (potencial) | 3,12 | Muy alto |
| **C_{pk} (real)** | **1,05** | **< 1,33 → no es de clase mundial** |
| C_{pm} (Taguchi) | 0,97 | Justo en el límite |
| P_{pk} (desempeño largo plazo) | 1,05 | < 1,33 |
| Nivel sigma | 3,15 σ | — |
| Nivel sigma (con corrim. 1,5σ) | 4,65 σ | — |
| DPMO teórico (escala Six Sigma) | 816 | — |

> **Hallazgo central.** La persona **cumple la cuota el 100 % de las veces, pero el proceso NO es capaz** en el sentido Six Sigma (C_{pk} = 1,05 < 1,33). El C_{pk} subió respecto a un escenario sin control porque el margen es de 3,15 σ, pero la **alta variabilidad de una persona no entrenada** (σ = 38 s en la muestra base) impide alcanzar el estándar de excelencia.

### 4.4. Bondad de ajuste (Anderson–Darling)

| Distribución | Estadístico A² | Ranking |
|---|---:|---|
| **Normal** | **0,061** | **1.º — mejor ajuste** |
| Lognormal | 0,501 | 2.º |
| PERT | 1,167 | 3.º |
| Triangular | 9,272 | 4.º — peor |

> Confirmado el **efecto del Teorema del Límite Central**: el ciclo completo (suma de 13 pasos) es prácticamente Normal.

### 4.5. Análisis económico

| Métrica | Valor mensual |
|---|---:|
| **Utilidad esperada** | **$3.815.747** |
| Mejor caso (P5) | $3.928.950 |
| Peor caso (P95) | $3.702.456 |
| **Utilidad esperada anual** | **$45.788.967** |
| Valor en Riesgo (VaR 95 %) | $113.291 |
| Valor en Riesgo Condicional (CVaR) | $140.293 |

Costo de mano de obra por grulla: 599 s × ($10.000/3600) ≈ **$1.664**; margen por unidad ≈ **$4.336**.

### 4.6. Sensibilidad (diagrama de Tornado, ±10 %)

| Factor | Amplitud de impacto sobre la utilidad |
|---|---:|
| Valor del producto | $1.056.000 |
| Volumen mensual | $763.149 |
| Tiempo de ciclo | $292.851 |
| Costo de mano de obra | $292.851 |

> *Nota:* los índices de Sobol de primer orden devolvieron 0 % (limitación de la implementación aproximada, documentada); el Tornado es la vista informativa. Frente al caso del experto, aquí el **tiempo de ciclo pesa mucho más** (su impacto pasó a ser comparable a las palancas comerciales), porque la persona no experta es más lenta y más variable.

### 4.7. Búsqueda de meta y tamaño de muestra

| Métrica | Valor |
|---|---:|
| Media necesaria para 95 % de cumplimiento | 656,8 s |
| Variabilidad máxima admisible (σ) | 73,5 s |
| Ciclos recomendados a cronometrar | **381** |

> La media (599 s) y la variabilidad (38 s) actuales **ya están por debajo** de los umbrales para 95 % de cumplimiento. El reto restante es reducir la variabilidad para alcanzar C_{pk} ≥ 1,33, es decir, **entrenar para consistencia**, no solo para velocidad.

---

## 5. Veredicto y lectura estratégica

### Veredicto: **PROCESO ACEPTABLE** (cumple la cuota, no es de clase mundial)

Una **persona no experta** que tarda en promedio **10 minutos** por grulla **cumple la cuota de 40 grullas por turno el 100 % de las veces** y genera una utilidad esperada de **$3,82 millones/mes**. Sin embargo, su **alta variabilidad** mantiene la capacidad (C_{pk} = 1,05) por debajo del estándar de excelencia (≥ 1,33).

### Insights estratégicos

1. **El cuello de botella son los pliegues de pétalo y la base pájaro (pasos 4 a 8).** Concentran ~356 s (≈ 59 % del ciclo) y la mayor dispersión (σ por paso de 15–18 s). **Toda mejora debe empezar aquí**: una guía visual, plantilla de doblez o ayuda tipo poka-yoke en estos pasos reduce a la vez el tiempo y la variabilidad.

2. **El problema no es la velocidad, es la consistencia.** La persona ya es lo bastante rápida para la cuota; lo que falta para ser "capaz" es **estabilidad**. La palanca correcta es **entrenamiento estandarizado** (instrucción de trabajo estándar, repetición deliberada), no presionar por velocidad —presionar la velocidad sin estandarizar el método **aumentaría** la variabilidad y empeoraría el C_{pk}.

3. **El riesgo económico es bajo y controlado.** El VaR del 5 % peor de los meses ($113.291) es el 3 % de la utilidad esperada. El negocio es viable incluso con operarios no expertos.

4. **Las palancas de rentabilidad son comerciales.** El Tornado muestra que el **valor del producto** y el **volumen** mueven la utilidad más que el tiempo: una vez asegurada la cuota, subir el precio o ampliar el mercado rinde más que exprimir segundos.

5. **Cuántas mediciones hacen falta.** Para que estas conclusiones tengan precisión del ±1 %, conviene cronometrar **381 ciclos** (no 30); con personas no expertas la muestra grande importa más, por su mayor dispersión.

---

## 6. Reproducibilidad

Caso 100 % reproducible: algoritmo = porteo exacto de `src/workers/montecarlo.worker.ts`, semilla `20260531`, parámetros y reglas declarados en las Secciones 1–3 (script en `tmp/mc_run.mjs`). Para un estudio sobre datos reales de planta, basta reemplazar los tiempos por paso de la Sección 1.1 por cronometrajes capturados con el módulo `StepTimer` de KRONOS.AI.

**Fuentes de los tiempos:** the-daily-dabble.com/origami-crane · perorigamian.craftshowsuccess.com · ideas2live4.com · origami.me/crane. **Costo laboral:** SMMLV Colombia 2025 (Decreto de salario mínimo). La fundamentación teórica de cada indicador está en `docs/paper-montecarlo-kronos.md`.
