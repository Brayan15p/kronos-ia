# Resultados de simulación Monte Carlo — Grulla de origami (13 pasos)

### Corrida real del motor de KRONOS.AI sobre el proceso de fabricación de grullas de origami

---

> **Cómo se generó este informe.** Todos los indicadores de la Sección 3 fueron **calculados ejecutando el algoritmo real** del módulo (porteo exacto de `src/workers/montecarlo.worker.ts`), con semilla fija `20260531` para garantizar reproducibilidad. La **configuración económica es la real del sistema** (objetivo 120 s, valor unitario $5.000, meta mensual 1.000 unidades, costo de mano de obra $15.000/h). Los **tiempos por paso** (Sección 1) constituyen el conjunto de datos de entrada de ejemplo: para un informe definitivo deben reemplazarse por los cronometrajes reales capturados en planta con el módulo `StepTimer`. Ningún número de salida fue inventado; todos provienen de la corrida.

- **Producto:** Grulla de origami
- **Número de pasos:** 13
- **Distribución ajustada:** Beta-PERT
- **Muestreo:** Quasi-Monte Carlo (secuencias de Halton, base 2, *scrambled*)
- **Escenarios simulados:** 20.000
- **Ciclos cronometrados (muestra base):** 30
- **Fecha de corrida:** 2026-05-31

---

## 1. Datos de entrada

### 1.1. Desglose de los 13 pasos (estadísticos de los 30 ciclos cronometrados)

| # | Paso | Tiempo medio (s) | Desv. est. (s) |
|---|------|-----------------:|---------------:|
| 1 | Corte del papel | 6,02 | 1,00 |
| 2 | Primer pliegue diagonal | 5,12 | 0,80 |
| 3 | Segundo pliegue diagonal | 5,17 | 0,94 |
| 4 | Pliegue base cuadrada | 12,47 | 2,35 |
| 5 | Pliegues laterales sup. | 9,84 | 1,87 |
| 6 | Pliegue pétalo superior | 10,51 | 2,11 |
| 7 | Pliegues laterales inf. | 10,37 | 1,89 |
| 8 | Pliegue pétalo inferior | 10,95 | 1,92 |
| 9 | Formación del cuello | 8,56 | 1,48 |
| 10 | Formación de la cola | 8,28 | 1,47 |
| 11 | Formación de la cabeza | 6,83 | 1,43 |
| 12 | Apertura de alas | 5,75 | 1,40 |
| 13 | Inspección / control de calidad | 5,07 | 1,26 |
| | **Suma de medias por paso** | **104,96** | |

El paso **4 (Pliegue base cuadrada)** es el más lento y el de mayor dispersión: es el cuello de botella natural del proceso y el candidato prioritario a estandarización.

### 1.2. Estadísticos del ciclo completo (muestra base, n = 30)

| Estadístico | Valor |
|---|---:|
| Media del ciclo (μ̂) | **104,96 s** |
| Desviación estándar muestral (σ̂) | **5,38 s** |
| Tiempo mínimo observado | 94,84 s |
| Tiempo máximo observado | 115,90 s |

### 1.3. Configuración (valores reales del sistema)

| Parámetro | Valor |
|---|---:|
| Objetivo de ciclo (USL) | 120 s |
| Valor por unidad | $5.000 |
| Meta de producción mensual | 1.000 unidades |
| Costo de mano de obra | $15.000 / hora ($4,1667 / s) |

---

## 2. Configuración de la simulación

| Parámetro | Valor |
|---|---:|
| Distribución | Beta-PERT |
| Modo de muestreo | QMC — Halton (base 2, *scrambled*) |
| Número de escenarios | 20.000 |
| Reducción de variabilidad | 0 % (escenario base, sin intervención) |
| Desplazamiento de la media | 0 % |
| Semilla aleatoria | 20260531 |

---

## 3. Resultados (calculados por el algoritmo real)

### 3.1. Distribución del tiempo de ciclo simulado

| Métrica | Valor |
|---|---:|
| Media simulada | **105,10 s** |
| Desviación estándar | 3,95 s |
| Coeficiente de variación | 3,76 % |
| Percentil 5 | 98,55 s |
| Percentil 10 | 100,00 s |
| Mediana (P50) | 105,09 s |
| Percentil 90 | 110,19 s |
| Percentil 95 | 111,64 s |
| IC 95 % de la media | [105,04 ; 105,15] s |
| Error estándar | 0,028 s |

### 3.2. Probabilidad de cumplimiento

| Métrica | Valor |
|---|---:|
| **P(ciclo ≤ 120 s)** | **100,0 %** |
| DPMO empírico (defectos por millón) | **0** |

> El cumplimiento es del 100 % porque la distribución Beta-PERT tiene **soporte acotado** en [94,84 ; 115,90] s (mínimo y máximo observados): ningún escenario simulado puede superar los 115,9 s, muy por debajo del objetivo de 120 s. En términos de tiempo de entrega, **el proceso cumple siempre el objetivo** con la muestra actual.

### 3.3. Capacidad de proceso

| Índice | Valor | Lectura |
|---|---:|---|
| C_p (potencial) | 3,72 | Muy alto |
| **C_{pk} (real)** | **0,92** | **< 1,33 → no alcanza el estándar Six Sigma** |
| C_{pm} (Taguchi) | 1,30 | Aceptable |
| P_p (desempeño) | 3,72 | — |
| P_{pk} | 0,93 | < 1,33 |
| Razón C_{pk}/P_{pk} | 0,99 | Proceso estable (corto ≈ largo plazo) |
| Nivel sigma | 2,77 σ | — |
| Nivel sigma (con corrim. 1,5σ) | 4,27 σ | — |
| DPMO teórico (escala Six Sigma) | 2.786 | — |

> **El hallazgo central.** El proceso cumple el objetivo el 100 % de las veces, pero el C_{pk} = 0,92 está por debajo del estándar de excelencia (≥ 1,33). La razón es que el objetivo (120 s) está a solo **2,77 desviaciones** de la media: hay holgura para entregar a tiempo, pero **no el margen de seguridad** que exige un proceso de clase mundial. La mejora prioritaria no es la velocidad —ya cumple— sino **reducir la variabilidad** para subir el C_{pk}.

### 3.4. Prueba de hipótesis (¿la media difiere del objetivo?)

| Métrica | Valor |
|---|---:|
| Estadístico t | −533,8 |
| Valor p | < 0,001 |
| ¿Se rechaza H₀? | **Sí** |

La media simulada (105,1 s) es significativamente menor que el objetivo (120 s): el proceso está estadísticamente centrado por debajo del límite, lo que confirma el cumplimiento.

### 3.5. Bondad de ajuste (Anderson–Darling)

| Distribución | Estadístico A² | Ranking |
|---|---:|---|
| **Normal** | **0,066** | **1.º — mejor ajuste** |
| Lognormal | 0,337 | 2.º |
| PERT | 1,097 | 3.º |
| Triangular | 9,824 | 4.º — peor ajuste |

> La distribución del **ciclo completo es prácticamente Normal** (A² = 0,066, el menor de todos). Esto es coherente con el **Teorema del Límite Central**: al sumar los tiempos de 13 pasos independientes, el total tiende a la normalidad aunque cada paso individual sea asimétrico. Es un resultado teóricamente esperado y refuerza la validez del modelo.

### 3.6. Análisis de sensibilidad

**Diagrama de Tornado (impacto sobre la utilidad mensual, perturbación ±10 %):**

| Factor | Amplitud de impacto |
|---|---:|
| Valor del producto | $1.000.000 |
| Volumen mensual | $912.420 |
| Tiempo de ciclo | $87.580 |
| Costo de mano de obra | $87.580 |

> El **valor del producto** y el **volumen mensual** dominan la rentabilidad; el tiempo de ciclo y el costo de mano de obra tienen un impacto económico un orden de magnitud menor. Conclusión operativa: una vez que el proceso cumple el objetivo, las palancas de mayor retorno económico son comerciales (precio y volumen), no de reducción de tiempo.
>
> *Nota metodológica:* en esta corrida los índices de Sobol de primer orden devolvieron 0 % para todos los factores, porque las perturbaciones aplicadas son transformaciones que no alteran la estructura de varianza relativa (limitación documentada de la implementación aproximada). El diagrama de Tornado es, por tanto, la vista de sensibilidad informativa en este caso.

### 3.7. Análisis económico

| Métrica | Valor mensual |
|---|---:|
| **Utilidad esperada** | **$4.562.099** |
| Mejor caso (P5) | $4.589.367 |
| Peor caso (P95) | $4.534.829 |
| **Utilidad esperada anual** | **$54.745.193** |
| Valor en Riesgo (VaR 95 %) | $27.271 |
| Valor en Riesgo Condicional (CVaR) | $33.858 |

> El riesgo económico es bajo: el VaR del 5 % peor de los meses es de apenas $27.271 frente a una utilidad esperada de $4,56 millones (0,6 %). El proceso es financieramente estable.

### 3.8. Búsqueda de meta (goal-seek) y tamaño de muestra

| Métrica | Valor |
|---|---:|
| Media necesaria para 95 % de cumplimiento | 111,16 s |
| Variabilidad máxima admisible (σ) | 9,06 s |
| Ciclos recomendados a cronometrar | **381** |

> La media actual (105,1 s) ya está **por debajo** de la requerida (111,16 s) y la variabilidad actual (5,38 s) ya está **por debajo** del techo (9,06 s): para el criterio de 95 % de cumplimiento el proceso **ya califica**. El reto restante es estrechar la dispersión para alcanzar C_{pk} ≥ 1,33. Para que estas conclusiones tengan precisión del ±1 %, se recomienda ampliar la muestra de 30 a **381 ciclos**.

---

## 4. Veredicto y plan de acción

### Veredicto: **PROCESO ACEPTABLE**

El proceso de fabricación de grullas de origami **cumple el objetivo de 120 s en el 100 % de los ciclos** y es **financieramente estable** (utilidad esperada $4,56 M/mes, riesgo de cola < 1 %). Sin embargo, **no alcanza el estándar de capacidad de clase mundial** (C_{pk} = 0,92 < 1,33), porque su margen frente al objetivo es de solo 2,77 σ.

### Acciones priorizadas

1. **Reducir la variabilidad del proceso** (palanca de calidad). Estandarizar el método del paso 4 (Pliegue base cuadrada), el más lento y disperso (12,47 s ± 2,35 s). Herramientas: instrucción de trabajo estándar, poka-yoke de doblez, cartas de control X̄-R. Meta: bajar σ para llevar C_{pk} de 0,92 a ≥ 1,33.
2. **Ampliar la muestra a 381 ciclos** para asegurar precisión estadística del ±1 % en los indicadores.
3. **Explorar palancas económicas** (valor de producto y volumen), que según el Tornado dominan la rentabilidad una vez garantizado el cumplimiento.

---

## 5. Reproducibilidad

Esta corrida es totalmente reproducible. El algoritmo es el porteo exacto de `src/workers/montecarlo.worker.ts`, ejecutado con semilla `20260531` (script en `tmp/mc_run.mjs`). Con la misma entrada y semilla, los resultados son idénticos. Para un informe sobre datos reales de planta, basta sustituir los tiempos por paso de la Sección 1.1 por los cronometrajes capturados con el módulo `StepTimer` de KRONOS.AI.

---

*Informe generado ejecutando el motor de simulación de Monte Carlo de KRONOS.AI. Las definiciones, ecuaciones y justificación teórica de cada indicador se documentan en el capítulo técnico `docs/paper-montecarlo-kronos.md`.*
