# Modelos de simulación Monte Carlo para el monitoreo de operarios y la optimización de métodos y tiempos

### Fundamentos, metodología e implementación del módulo de simulación estocástica de KRONOS.AI

---

> **Nota de transparencia metodológica.** Todas las ecuaciones, algoritmos y constantes descritas en este capítulo corresponden a la implementación real del módulo (archivo `src/workers/montecarlo.worker.ts` y `src/components/MonteCarloSimulator.tsx`). Los valores numéricos que aparecen en los ejemplos de la Sección 7 están **explícitamente marcados como ilustrativos**: sirven para demostrar la lectura de los resultados y **no constituyen datos empíricos de un proceso real**. Toda referencia bibliográfica fue verificada en su fuente primaria (volumen, número y páginas se indican en la Sección 11).

---

## Resumen

El estudio de tiempos y métodos, en su formulación clásica, reduce la variabilidad de la operación humana a un único valor determinista —el tiempo estándar—, ignorando que el desempeño de un operario es una variable aleatoria con dispersión, sesgo y colas. Este capítulo describe el fundamento teórico, la metodología y la implementación de un módulo de simulación de Monte Carlo orientado al monitoreo de operarios y a la optimización de métodos y tiempos. El módulo toma como entrada los tiempos de ciclo medidos directamente sobre el puesto de trabajo, ajusta a ellos una distribución de probabilidad (Normal, Lognormal, Triangular, Beta-PERT o un remuestreo *bootstrap* no paramétrico), y propaga la incertidumbre mediante muestreo de baja discrepancia —secuencias de Halton (Quasi-Monte Carlo) o Latin Hypercube Sampling con variables antitéticas—. De la distribución simulada se derivan: índices de capacidad de proceso (C_p, C_{pk}, C_{pm}, P_p, P_{pk}), nivel sigma y defectos por millón de oportunidades (DPMO), un análisis de sensibilidad global por índices de Sobol de primer orden, pruebas de bondad de ajuste de Anderson–Darling, y métricas de riesgo económico (valor esperado, Valor en Riesgo y Valor en Riesgo Condicional). Se argumenta, con respaldo en la literatura fundacional y en aplicaciones documentadas de McKinsey, Harvard, MIT y Oxford, por qué la simulación estocástica supera al cálculo basado en promedios para la toma de decisiones operativas bajo incertidumbre.

**Palabras clave:** simulación de Monte Carlo; Quasi-Monte Carlo; estudio de tiempos; capacidad de proceso; análisis de sensibilidad; Valor en Riesgo Condicional; ingeniería de métodos.

## Abstract

Classical time-and-motion study collapses the variability of human work into a single deterministic figure —the standard time— ignoring that an operator's performance is a random variable with spread, skewness and tails. This chapter describes the theoretical foundation, methodology and implementation of a Monte Carlo simulation module aimed at operator monitoring and the optimization of work methods and times. The module takes as input the cycle times measured directly at the workstation, fits a probability distribution to them (Normal, Lognormal, Triangular, Beta-PERT or a non-parametric bootstrap resampling), and propagates uncertainty through low-discrepancy sampling —Halton sequences (Quasi-Monte Carlo) or Latin Hypercube Sampling with antithetic variates. From the simulated distribution it derives: process capability indices (C_p, C_{pk}, C_{pm}, P_p, P_{pk}), sigma level and defects per million opportunities (DPMO), a global sensitivity analysis via first-order Sobol indices, Anderson–Darling goodness-of-fit tests, and economic risk metrics (expected value, Value-at-Risk and Conditional Value-at-Risk). We argue, supported by the foundational literature and by documented applications from McKinsey, Harvard, MIT and Oxford, why stochastic simulation outperforms average-based computation for operational decision-making under uncertainty.

**Keywords:** Monte Carlo simulation; Quasi-Monte Carlo; time study; process capability; sensitivity analysis; Conditional Value-at-Risk; methods engineering.

---

## 1. Introducción

### 1.1. El problema del determinismo en el estudio de tiempos

El estudio de tiempos y movimientos, fundado por Frederick W. Taylor y Frank y Lillian Gilbreth y sistematizado por la Organización Internacional del Trabajo y por la obra de referencia de Niebel y Freivalds [11], persigue establecer el *tiempo estándar*: el tiempo que un operario calificado, trabajando a ritmo normal y con suplementos por fatiga y necesidades personales, requiere para ejecutar una tarea según un método definido. La práctica habitual consiste en cronometrar un número de ciclos, calcular un promedio, aplicar un factor de valoración del ritmo y añadir suplementos. El resultado es **un único número**.

Ese número es, sin embargo, una abstracción peligrosa. El desempeño humano no es constante: varía entre ciclos por fatiga, microparos, variabilidad de la materia prima, diferencias de método entre operarios y centenares de causas comunes y especiales. Tratar el tiempo de ciclo como una constante equivale a suponer que el proceso producirá siempre exactamente el promedio, cuando en realidad lo que ocurre es una **distribución** de tiempos alrededor de ese promedio.

Savage, en su influyente artículo de la *Harvard Business Review* "The Flaw of Averages" [9], califica esta práctica como una falacia "tan fundamental como creer que la Tierra es plana". Su tesis —"las decisiones basadas en números promedio son, en promedio, erróneas"— es directamente aplicable a la ingeniería industrial: planificar una línea, dimensionar una dotación o comprometer una fecha de entrega usando exclusivamente el tiempo estándar promedio conduce sistemáticamente a estimaciones sesgadas, porque la combinación no lineal de variables inciertas (tiempo de ciclo, volumen, precio, costo de mano de obra) no se comporta como el promedio de sus partes (la llamada desigualdad de Jensen, que subyace al fenómeno).

### 1.2. La respuesta: propagar la incertidumbre, no esconderla

La simulación de Monte Carlo ofrece la alternativa rigurosa. En lugar de un punto, modela cada variable de entrada como una distribución de probabilidad, genera miles de escenarios aleatorios coherentes con esas distribuciones, y observa la **distribución completa de resultados**. McKinsey & Company describe esta técnica como un método "usado transversalmente en todos los sectores para medir y pronosticar riesgo o incertidumbre", capaz de "ofrecer una comprensión superior de las distribuciones de resultados del mundo real y permitir decisiones más informadas" [7], [8]. El presente módulo lleva esa lógica al dominio específico del trabajo manual: convierte una nube de cronometrajes reales en un modelo probabilístico del proceso y responde preguntas que el tiempo estándar no puede responder.

### 1.3. Objetivo y alcance del capítulo

Este capítulo documenta de forma completa el módulo de simulación de Monte Carlo de KRONOS.AI: su fundamento matemático, las decisiones de diseño algorítmico, los datos que consume, los indicadores que produce y la justificación de cada técnica con base en la literatura. No es un manual de usuario; es la memoria técnica y científica del modelo. Se organiza así: la Sección 2 revisa el estado del arte; la Sección 3 describe los datos de entrada; la Sección 4, el motor de muestreo; la Sección 5, las distribuciones; la Sección 6, los indicadores derivados; la Sección 7, un ejemplo ilustrado de interpretación; la Sección 8 discute las bondades y por qué el método aplica al monitoreo de operarios; la Sección 9, las limitaciones; la Sección 10 concluye.

---

## 2. Estado del arte y marco teórico

### 2.1. Origen y consolidación del método de Monte Carlo

El método de Monte Carlo fue formalizado por Metropolis y Ulam en 1949 en el *Journal of the American Statistical Association* [1], a partir del trabajo en el Laboratorio Nacional de Los Álamos durante el Proyecto Manhattan. Su idea central es resolver problemas deterministas difíciles —integrales de alta dimensión, ecuaciones integro-diferenciales— mediante muestreo aleatorio repetido: si no se puede calcular analíticamente el valor esperado de una función de variables aleatorias, se lo estima generando muchas realizaciones y promediando. La Oxford Handbooks lo describe como "una estrategia de investigación que incorpora aleatoriedad en el diseño, la implementación o la evaluación de modelos teóricos", surgida en los años 1940 con la disponibilidad de hardware de cómputo [10].

La garantía teórica del método es la Ley de los Grandes Números (la media muestral converge al valor esperado) y el Teorema del Límite Central (el error de la estimación es asintóticamente normal y decrece como O(1/√N), donde N es el número de simulaciones). Esta tasa O(1/√N) es independiente de la dimensión del problema —lo que hace al método imbatible en alta dimensión— pero también es lenta: cuadruplicar la precisión exige multiplicar por dieciséis el número de muestras.

### 2.2. Quasi-Monte Carlo y secuencias de baja discrepancia

Para acelerar la convergencia, Halton propuso en 1960, en *Numerische Mathematik* [2], sustituir los números pseudoaleatorios por **secuencias deterministas de baja discrepancia**, que cubren el espacio de manera más uniforme y evitan los racimos y huecos del azar puro. Las secuencias de Halton se construyen a partir de la inversa radical de los enteros en bases primas. El método Quasi-Monte Carlo (QMC) resultante alcanza, bajo condiciones de regularidad, una tasa de convergencia de orden O((log N)^d / N), sustancialmente mejor que O(1/√N) para dimensiones moderadas. En la práctica, mil puntos de Halton pueden cubrir el espacio con la fidelidad de unos diez mil puntos pseudoaleatorios.

### 2.3. Latin Hypercube Sampling

McKay, Beckman y Conover introdujeron en 1979, en *Technometrics* [3], el Latin Hypercube Sampling (LHS): una técnica de muestreo estratificado que divide el rango de cada variable en N estratos equiprobables y toma exactamente una muestra de cada estrato. LHS reduce la varianza del estimador respecto del muestreo aleatorio simple para la media muestral y la función de distribución empírica, y es hoy un estándar en análisis de incertidumbre de códigos de cómputo. Combinado con **variables antitéticas** (emparejar cada muestra u con su reflejo 1−u), reduce aún más la varianza al inducir correlación negativa entre pares de realizaciones.

### 2.4. Distribución Beta-PERT para tiempos de actividad

Malcolm, Roseboom, Clark y Fazar, en su artículo fundacional sobre PERT de 1959 en *Operations Research* [4] —desarrollado para el programa de misiles Polaris de la Marina de los EE. UU.—, propusieron modelar el tiempo de una actividad mediante una distribución Beta caracterizada por tres estimaciones: optimista (a), más probable (m) y pesimista (b). La media de la PERT es (a + 4m + b)/6, una ponderación que da cuatro veces más peso al valor modal. Esta parametrización captura la **asimetría** típica de los tiempos de operación humana: es más fácil retrasarse mucho que adelantarse mucho, de modo que la cola derecha es más larga.

### 2.5. Análisis de sensibilidad global: índices de Sobol

El análisis de sensibilidad responde a la pregunta "¿qué variable de entrada explica más la variabilidad del resultado?". A diferencia de los métodos locales (derivadas parciales en un punto), el análisis de sensibilidad **global** de Sobol descompone la varianza total de la salida en contribuciones atribuibles a cada entrada y a sus interacciones. El índice de primer orden S_i mide la fracción de la varianza de la salida que se eliminaría si se fijara la entrada i. La obra de referencia es *Global Sensitivity Analysis: The Primer* de Saltelli y colaboradores [5]. Estos índices se calculan típicamente mediante integrales de alta dimensión evaluadas con técnicas Monte Carlo o Quasi-Monte Carlo, lo que los hace naturalmente compatibles con el motor de simulación.

### 2.6. Bondad de ajuste: prueba de Anderson–Darling

Para verificar qué distribución teórica describe mejor los datos observados, Anderson y Darling propusieron en 1954, en el *Journal of the American Statistical Association* [6] (con fundamento asintótico en su trabajo de 1952 en *Annals of Mathematical Statistics*), una prueba de bondad de ajuste que pondera más las **colas** de la distribución que la zona central —precisamente la región crítica para evaluar riesgo de incumplimiento—. El estadístico A² es pequeño cuando el ajuste es bueno y crece con la discrepancia.

### 2.7. Riesgo económico: VaR y CVaR

El Valor en Riesgo (VaR) cuantifica la pérdida potencial en un percentil dado; el Valor en Riesgo Condicional (CVaR, o Expected Shortfall) promedia las pérdidas más allá de ese percentil, capturando la severidad de la cola. Rockafellar y Uryasev demostraron en 2000, en el *Journal of Risk* [12], que el CVaR es matemáticamente superior al VaR en problemas de optimización, por ser coherente y convexo. El módulo traslada estas métricas, originadas en finanzas, a la rentabilidad operativa del proceso.

### 2.8. Aplicaciones documentadas en la industria y la academia

- **McKinsey & Company** documenta el uso de modelos probabilísticos de Monte Carlo en la evaluación de riesgos de proyectos de capital de miles de millones de dólares, modelando rangos de resultados en cronogramas y precios de insumos para tomar "mejores decisiones sobre los riesgos" [7], [8].
- **Harvard Business Review** popularizó el caso de negocio del método con "The Flaw of Averages" de Savage [9], que articula por qué la planificación basada en promedios falla sistemáticamente.
- **MIT**, en su curso de la Sloan School of Management *System Optimization and Analysis for Manufacturing* (15.066J) [13], enseña la simulación estática de Monte Carlo como herramienta de optimización y análisis de manufactura.
- **Oxford University Press**, a través de los Oxford Handbooks [10], sitúa el análisis de Monte Carlo como estrategia metodológica de investigación consolidada.

Herramientas comerciales como @RISK (Palisade), Crystal Ball (Oracle), AnyLogic y Simio implementan variantes de estas mismas técnicas. El módulo de KRONOS.AI reproduce el núcleo metodológico de estas plataformas —muestreo de baja discrepancia, ajuste de distribuciones, análisis de sensibilidad y métricas de riesgo— especializándolo en el dominio del trabajo manual y el monitoreo de operarios.

---

## 3. Datos de entrada: ¿sobre qué se simula?

### 3.1. Origen de los datos

El principio rector del módulo es que **se simula sobre datos reales, no sobre supuestos**. La entrada primaria es el conjunto de tiempos de ciclo medidos directamente sobre el operario mediante el cronómetro integrado de la aplicación (`StepTimer`) o por captura manual (`ManualTimeEntry`). Cada ciclo aporta una duración en segundos. El módulo filtra las duraciones positivas y construye la muestra base:

```
times = cycles.map(c => c.duration).filter(d => d > 0)
```

A partir de esa muestra calcula los estadísticos descriptivos que parametrizan la simulación:

- **Media muestral:** μ̂ = (1/n) Σ tᵢ
- **Desviación estándar muestral (insesgada, con n−1):** σ̂ = √[ (1/(n−1)) Σ (tᵢ − μ̂)² ]
- **Mínimo y máximo observados:** t_min, t_max (usados como soporte de las distribuciones Triangular y PERT)

Esta dependencia de datos reales es lo que conecta el modelo con el monitoreo de operarios: cuantos más ciclos se cronometren, más fiel es la distribución base y más estrechos los intervalos de confianza (véase la Sección 6.9 sobre el N recomendado).

### 3.2. Parámetros de control del escenario

Sobre la muestra base, el ingeniero define el escenario a simular mediante parámetros ajustables (persistidos entre sesiones en almacenamiento local):

- **Objetivo (target):** el tiempo de ciclo máximo admisible, tratado como límite superior de especificación (USL). En el monitoreo de operarios, "cumplir" significa ejecutar el ciclo en un tiempo igual o menor al objetivo.
- **Reducción de variabilidad (varReduction, %):** simula el efecto de una intervención de mejora que estabiliza el proceso. Modifica la desviación efectiva:
  σ_ef = σ̂ · (1 − varReduction/100)
- **Desplazamiento de la media (meanShift, %):** simula una mejora o deterioro del método que mueve el tiempo central:
  μ_ef = μ̂ · (1 + meanShift/100)
- **Distribución (dist):** Normal, Lognormal, Triangular, PERT o Bootstrap.
- **Número de simulaciones (simCount):** desde cientos hasta decenas de miles de escenarios.
- **Modo de muestreo (samplingMode):** QMC (Halton) o LHS+antitético.

### 3.3. Parámetros económicos

Para traducir tiempo en dinero, el módulo consume tres parámetros del módulo de costos:

- **Costo horario promedio (avgHourlyCost):** convertido a costo por segundo, c = avgHourlyCost / 3600.
- **Volumen mensual objetivo (qty):** unidades producidas por mes.
- **Precio/valor por unidad (price):** margen o valor agregado por unidad.

La función de utilidad por unidad es lineal en el tiempo de ciclo:

  π(t) = qty · (price − t · c)

Esta función es la que se evalúa en cada escenario simulado para obtener la distribución de rentabilidad.

---

## 4. Motor de muestreo

El corazón del módulo es un *Web Worker* que ejecuta la simulación en un hilo separado, de modo que la interfaz nunca se congela. Todas las constantes numéricas se declaran a nivel de módulo y el bucle principal opera sobre `Float64Array` sin reservar memoria en su interior (cero *allocations* en el *hot loop*), lo que permite ejecutar decenas de miles de iteraciones en milisegundos.

### 4.1. Generación de números uniformes de baja discrepancia

Según el modo elegido, el módulo genera el vector de uniformes u ∈ [0,1) por una de dos vías.

**Quasi-Monte Carlo — secuencias de Halton.** La inversa radical en base b del entero i se calcula iterando la extracción de dígitos:

```
haltonSingle(i, b):
    f = 1, r = 0, k = i + 1          // 1-indexado, evita el 0
    mientras k > 0:
        f = f / b
        r = r + f · (k mod b)
        k = ⌊k / b⌋
    retornar r
```

La primera dimensión usa base 2. Para evitar la correlación de retícula entre simulaciones sucesivas, se aplica un *scramble* aleatorio: un desplazamiento offset ∈ [0,1) que se suma módulo 1 a toda la secuencia:

  uᵢ = (haltonSingle(i, 2) + offset) mod 1

Esto convierte la secuencia determinista en una secuencia aleatorizada (*randomized QMC*), que conserva la baja discrepancia pero permite estimar el error por repetición.

**Latin Hypercube Sampling con variables antitéticas.** La rutina LHS construye N estratos equiprobables y los permuta aleatoriamente (barajado de Fisher–Yates):

```
lhsSample(N):
    uᵢ = (i + U) / N     para i = 0..N−1,  U ~ Uniforme(0,1)
    barajar u con Fisher–Yates
```

Sobre esa base, las variables antitéticas emparejan cada muestra con su reflejo:

  u[2i] = base[i],   u[2i+1] = 1 − base[i]

La correlación negativa entre cada par reduce la varianza de la media estimada sin coste adicional de cómputo.

### 4.2. Transformación inversa: de uniforme a normal

Para convertir un uniforme en una desviación normal estándar, el módulo usa la aproximación racional de **Beasley–Springer–Moro** de la función cuantil normal inversa Φ⁻¹(p), con un polinomio racional para la región central (|p − 0.5| < 0.42) y una expansión logarítmica para las colas. Esta aproximación alcanza precisión de doble flotante y es mucho más rápida que métodos iterativos. La función de distribución acumulada normal Φ(z) se evalúa con la aproximación polinómica de Zelen–Severo (Abramowitz & Stegun 26.2.17), usada en el cálculo de probabilidades de cumplimiento y DPMO.

### 4.3. Cálculo incremental de la media y la varianza (algoritmo de Welford)

Para evitar una segunda pasada sobre los datos y los errores de cancelación catastrófica de la fórmula ingenua de la varianza, el bucle actualiza la media y la suma de cuadrados de desviaciones en línea con el **algoritmo de Welford**:

```
count = i + 1
delta = v − media
media = media + delta / count
M2    = M2 + delta · (v − media)
varianza = M2 / (count − 1)
```

Esto produce media y varianza numéricamente estables en una sola pasada.

### 4.4. Seguimiento de convergencia

En puntos de control predefinidos (100, 250, 500, 1.000, 2.000, … hasta simCount), el módulo registra la media acumulada y el percentil 95 aproximado (media + 1,645·σ). Esta curva de convergencia permite verificar visualmente que la estimación se ha estabilizado y que el número de simulaciones es suficiente.

---

## 5. Distribuciones de probabilidad

El módulo ofrece cinco modelos para la variable "tiempo de ciclo", cubriendo desde el supuesto paramétrico más simple hasta el remuestreo no paramétrico.

### 5.1. Normal

  v = max(0, μ_ef + σ_ef · Φ⁻¹(u))

Apropiada cuando los tiempos son simétricos alrededor de la media. El truncamiento en 0 evita tiempos negativos.

### 5.2. Lognormal

Cuando los tiempos son asimétricos a la derecha (lo habitual en trabajo manual), la lognormal modela el sesgo positivo. A partir del coeficiente de variación cv = σ_ef/μ_ef:

  s² = ln(1 + cv²),   m = ln(μ_ef) − s²/2,   v = exp(m + √s² · Φ⁻¹(u))

Esta parametrización preserva la media y la varianza objetivo en el espacio original.

### 5.3. Triangular

Definida por mínimo, moda y máximo, se muestrea por inversión exacta de su CDF, con punto de quiebre f_c = (c−a)/(b−a):

  v = a + √[ u·(b−a)·(c−a) ]      si u < f_c
  v = b − √[ (1−u)·(b−a)·(b−c) ]  si u ≥ f_c

Útil cuando solo se dispone de estimaciones de tres puntos por juicio experto.

### 5.4. Beta-PERT

Implementa la distribución de Malcolm et al. [4]. A partir de a, m, b calcula la media PERT y los parámetros de forma:

  μ_PERT = (a + 4m + b)/6
  α = 6·(μ_PERT − a)/(b − a),   β = 6·(b − μ_PERT)/(b − a)

y genera la variable mediante una aproximación normal de la Beta estandarizada, reescalada al soporte [a, b]. Es el modelo recomendado para tiempos de operación humana por capturar la asimetría con un solo parámetro de forma intuitivo.

### 5.5. Bootstrap (no paramétrico)

Cuando no se desea imponer ninguna forma funcional, el módulo remuestrea directamente de los tiempos reales observados, añadiendo una pequeña perturbación gaussiana (12% de σ) para suavizar:

  idx = ⌊u · n⌋,   v = max(0, t[idx]·(1 + meanShift/100) + 0,12·σ_ef·Φ⁻¹(aleatorio))

Este enfoque preserva exactamente la forma empírica de la distribución de los datos, incluyendo cualquier multimodalidad o irregularidad que ningún modelo paramétrico capturaría.

---

## 6. Indicadores derivados

Tras generar los escenarios, el módulo ordena el vector de resultados (ordenamiento nativo de `Float64Array`) y deriva la siguiente batería de indicadores.

### 6.1. Estadísticos de posición y dispersión

Percentiles p5, p10, p50, p90, p95 por indexación directa sobre el vector ordenado; media y desviación de Welford; coeficiente de variación cv = σ/μ; y la moda estimada a partir del histograma de 32 clases.

### 6.2. Probabilidad de cumplimiento

La proporción de escenarios que cumplen el objetivo se cuenta por búsqueda binaria sobre el vector ordenado:

  P(t ≤ objetivo) = #{ tᵢ ≤ objetivo } / N

Este es el indicador más directo para el monitoreo: la probabilidad de que un ciclo cualquiera cumpla el tiempo máximo admisible.

### 6.3. Intervalo de confianza de la media

  IC₉₅ = μ ± 1,96 · σ/√N

El error estándar σ/√N decrece con la raíz del número de simulaciones, lo que cuantifica la precisión de la estimación.

### 6.4. Índices de capacidad de proceso

Tratando el objetivo como límite superior de especificación, el módulo calcula la familia completa de índices de capacidad [11]:

- **C_p** = objetivo / (6σ_ef) — capacidad potencial.
- **C_{pk}** = (objetivo − μ) / (3σ_ef) — capacidad real, penaliza el descentrado.
- **C_{pm}** = objetivo / (6τ), con τ = √[σ² + (μ − objetivo)²] — índice de Taguchi, penaliza la desviación respecto al objetivo.
- **P_p, P_{pk}** — desempeño de largo plazo, calculados con la desviación de la muestra base (σ_real) en lugar de la efectiva, lo que permite contrastar capacidad de corto plazo frente a desempeño histórico.
- **Razón C_{pk}/P_{pk}** — diagnostica si la diferencia entre capacidad potencial y desempeño real es atribuible a corrimientos del proceso.

El criterio de aceptación industrial habitual es C_{pk} ≥ 1,33.

### 6.5. Nivel sigma y DPMO

  nivel sigma = (objetivo − μ)/σ_ef
  σ_seis = min(6, máx(0, nivel sigma + 1,5))   (corrimiento estándar de 1,5σ de largo plazo)
  DPMO_teórico = (1 − Φ(σ_seis − 1,5)) · 10⁶
  DPMO_empírico = (1 − P(cumple)) · 10⁶

El DPMO empírico —defectos por millón observados directamente en la simulación— es robusto frente a desviaciones de la normalidad, mientras que el teórico permite ubicar el proceso en la escala Six Sigma convencional.

### 6.6. Prueba de hipótesis

Un estadístico t contrasta si la media simulada difiere significativamente del objetivo:

  t = (μ − objetivo)/(σ/√N),   p = Φ(t),   se rechaza H₀ si p < 0,05

### 6.7. Análisis de sensibilidad global (Sobol de primer orden)

Sobre una submuestra (paso adaptativo para acotar el cómputo a ~3.000 puntos), el módulo construye la utilidad base y estima el índice de primer orden de cuatro factores —tiempo de ciclo, valor del producto, volumen mensual y costo de mano de obra— como la reducción relativa de varianza al perturbar cada factor:

  Sᵢ = máx(0, mín(1, (Var(Y) − Var(Y|perturbación de i)) / Var(Y)))

Los factores se ordenan por Sᵢ descendente, identificando cuál explica más la variabilidad de la rentabilidad. (Véase la nota de la Sección 9 sobre el carácter aproximado de esta estimación.)

### 6.8. Bondad de ajuste (Anderson–Darling)

Sobre una submuestra (~2.000 puntos), el módulo calcula el estadístico A² de Anderson–Darling [6] para cuatro distribuciones candidatas (Normal, Lognormal, Triangular, PERT), permitiendo al ingeniero verificar cuál describe mejor los datos. El estadístico se evalúa con la fórmula

  A² = −N − (1/N) Σ (2i+1)·[ ln F(t₍ᵢ₎) + ln(1 − F(t₍N−1−ᵢ₎)) ]

dando más peso a las colas. Menor A² indica mejor ajuste.

### 6.9. Tamaño de muestra recomendado

El módulo calcula cuántos ciclos sería necesario cronometrar para alcanzar precisión objetivo, tanto para estimar la media (margen del 1% de la media) como la proporción de cumplimiento (margen del 1%):

  N_media = ⌈ (1,96·σ / margen)² ⌉
  N_prop  = ⌈ (1,96² · p(1−p)) / 0,01² ⌉
  N_recomendado = máx(N_media, N_prop)

Esta es la conexión operativa directa con el monitoreo: indica al supervisor cuántas mediciones adicionales necesita para que sus conclusiones sean estadísticamente robustas.

### 6.10. Métricas de riesgo económico

Aplicando la función de utilidad π(t) = qty·(price − t·c) a la distribución simulada:

- **Valor esperado:** E[π] = π(μ)
- **Mejor / peor caso:** π(p5) y π(p95)
- **VaR 95%:** VaR = E[π] − π(p95) (pérdida potencial frente al valor esperado)
- **CVaR (Expected Shortfall):** promedio de la utilidad en el 5% peor de los escenarios, restado del valor esperado [12]
- **Mejora vs. línea base:** diferencia entre la utilidad esperada del escenario simulado y la del proceso sin intervenir (μ base), mensual y anualizada
- **Costo ahorrado / perdido:** traducción del margen entre percentiles a dinero

### 6.11. Análisis de Tornado

Un diagrama de Tornado evalúa la sensibilidad de la utilidad a una perturbación de ±10% (análisis *one-at-a-time*) en cada uno de los cuatro factores, ordenando las barras por amplitud de impacto. Es la representación visual complementaria al análisis de Sobol: muestra de un vistazo qué palanca mueve más la rentabilidad.

### 6.12. Goal-seek (búsqueda de meta)

El módulo calcula los valores objetivo que el proceso debería alcanzar para ser capaz:

  μ_meta = objetivo − 1,645·σ_ef   (media necesaria para 95% de cumplimiento)
  σ_meta = (objetivo − μ)/1,645     (variabilidad máxima admisible)

expresando además la reducción porcentual requerida respecto a la situación actual.

### 6.13. Veredicto sintético

El módulo condensa el diagnóstico en tres niveles:

- **Capaz:** P(cumple) ≥ 0,95 **y** C_{pk} ≥ 1,33
- **Aceptable:** P(cumple) ≥ 0,80 **o** C_{pk} ≥ 1,00
- **No capaz:** en otro caso

Este veredicto, junto con las acciones concretas derivadas (estandarización, poka-yoke, cartas de control X̄-R, balanceo de línea, técnicas MOST/MTM), traduce la estadística en decisiones de ingeniería.

---

## 7. Ejemplo ilustrado de interpretación

> **Los valores de esta sección son ilustrativos**, construidos para mostrar cómo se leen los resultados. No corresponden a un proceso real.

Supóngase un puesto de ensamble manual donde se cronometraron ciclos cuyo análisis arroja μ̂ = 52 s y σ̂ = 6 s, con objetivo de 60 s. Tras simular 10.000 escenarios con distribución PERT y muestreo QMC, el módulo reportaría, por ejemplo:

- **Probabilidad de cumplimiento ≈ 91%** → de cada 100 ciclos, ~9 superan el objetivo.
- **C_{pk} ≈ 0,44** → muy por debajo de 1,33: el proceso **no es capaz**; el objetivo está a menos de 1,5 desviaciones de la media.
- **DPMO empírico ≈ 90.000** → nivel sigma cercano a 2,8σ.
- **Goal-seek:** para alcanzar 95% de cumplimiento, la media debería bajar a ≈ 50,1 s **o** la desviación reducirse a ≤ 4,9 s.
- **Sensibilidad (Sobol/Tornado):** el "tiempo de ciclo" explica la mayor parte de la varianza de la rentabilidad → la palanca prioritaria es reducir y estabilizar el tiempo, no ajustar precio o volumen.
- **Riesgo económico:** VaR y CVaR cuantifican cuánta utilidad mensual se pone en juego por la cola de ciclos lentos.

La **lectura en menos de cinco segundos** sería: *proceso no capaz, principal causa la variabilidad del tiempo de ciclo, acción prioritaria estandarizar el método para bajar la media a ~50 s.* Esa es la diferencia frente al tiempo estándar clásico, que solo habría dicho "52 segundos" sin revelar el riesgo de incumplimiento ni la palanca de mejora.

---

## 8. Bondades y justificación del método

### 8.1. Por qué aplica al monitoreo de operarios

El monitoreo de operarios genera, por naturaleza, **series de tiempos de ciclo variables**. La simulación de Monte Carlo es el marco natural para ese dato porque:

1. **Modela la variabilidad, no la oculta.** Donde el estudio de tiempos clásico colapsa la realidad en un promedio, el módulo conserva y propaga toda la dispersión, en línea con la crítica de Savage [9].
2. **Responde preguntas probabilísticas que el promedio no puede.** "¿Qué probabilidad hay de cumplir el objetivo?", "¿cuánto riesgo económico esconde la cola?", "¿cuántas mediciones más necesito?" son preguntas que requieren la distribución completa.
3. **Conecta calidad y economía.** Une los índices de capacidad de Six Sigma [11] con métricas de riesgo financiero [12] en un solo modelo, permitiendo priorizar mejoras por su impacto monetario.
4. **Identifica la palanca correcta.** El análisis de sensibilidad de Sobol [5] dirige el esfuerzo de mejora al factor que realmente domina la variabilidad, evitando optimizaciones irrelevantes.

### 8.2. Por qué las técnicas elegidas son las correctas

- **QMC/Halton [2] y LHS [3]** ofrecen estimaciones más precisas con menos simulaciones que el Monte Carlo ingenuo: convergencia y eficiencia demostradas en la literatura.
- **Beta-PERT [4]** captura la asimetría real de los tiempos humanos mejor que la normal.
- **Welford** garantiza estabilidad numérica.
- **Anderson–Darling [6]** verifica que el modelo elegido se ajusta a los datos, dando rigor al supuesto distribucional.
- **CVaR [12]** mide el riesgo de cola de forma coherente, algo que el VaR por sí solo no logra.

### 8.3. Alineación con la práctica de referencia

El módulo reproduce el núcleo metodológico que McKinsey aplica a proyectos de capital [7], [8], que MIT enseña en manufactura [13] y que las plataformas comerciales (@RISK, Crystal Ball, AnyLogic, Simio) implementan, adaptándolo al dominio específico del trabajo manual. No es una herramienta heurística: es la transferencia rigurosa de métodos validados a la ingeniería de métodos y tiempos.

---

## 9. Limitaciones y honestidad metodológica

En aras del rigor, se documentan las limitaciones del modelo:

1. **El índice de Sobol implementado es una aproximación de primer orden** basada en perturbación, no la estimación canónica por integrales de Sobol/Saltelli con matrices A, B [5]. Identifica correctamente el factor dominante pero no debe interpretarse como un índice de varianza exacto ni captura interacciones de orden superior.
2. **El módulo simula una sola variable estocástica (el tiempo de ciclo).** Los demás factores económicos (volumen, precio, costo) se tratan como deterministas en la propagación principal y solo se perturban en los análisis de sensibilidad. Una extensión multivariada con estructura de correlación sería un trabajo futuro.
3. **La calidad del modelo depende de la calidad de los datos.** Pocos ciclos cronometrados producen estimaciones de media y varianza inestables; de ahí la importancia del N recomendado (Sección 6.9).
4. **El corrimiento de 1,5σ** en el cálculo del nivel sigma es una convención industrial estándar, no una propiedad del proceso particular.
5. **La función de utilidad es lineal** en el tiempo de ciclo; procesos con economías o deseconomías de escala requerirían una función no lineal.

Declarar estas limitaciones no debilita el modelo: lo hace científicamente honesto y delimita correctamente el alcance de sus conclusiones.

---

## 10. Conclusiones

El estudio de tiempos basado en un único valor promedio es insuficiente para decidir bajo incertidumbre. El módulo de simulación de Monte Carlo de KRONOS.AI sustituye ese determinismo por un modelo probabilístico que parte de los tiempos de ciclo reales de los operarios, propaga su variabilidad mediante muestreo de baja discrepancia (Halton) o estratificado (LHS con variables antitéticas), ajusta distribuciones validadas por Anderson–Darling, y deriva un cuadro completo de indicadores: capacidad de proceso, nivel sigma, DPMO, sensibilidad global de Sobol y riesgo económico (VaR/CVaR). El resultado es un diagnóstico que, en segundos, dice si el proceso es capaz, por qué no lo es, cuál es la palanca prioritaria de mejora y cuánto dinero está en juego.

La justificación de cada elección metodológica reposa en literatura fundacional verificable —Metropolis y Ulam [1], Halton [2], McKay et al. [3], Malcolm et al. [4], Saltelli et al. [5], Anderson y Darling [6], Rockafellar y Uryasev [12]— y en aplicaciones documentadas de McKinsey [7], [8], Harvard [9], MIT [13] y Oxford [10]. El módulo no inventa un método: traslada con rigor el estado del arte de la simulación estocástica al dominio específico del monitoreo de operarios y la optimización de métodos y tiempos.

### Trabajo futuro

Extensión a simulación multivariada con correlaciones; estimación canónica de índices de Sobol totales; incorporación de modelos de fatiga dependientes del tiempo; y validación empírica con datos longitudinales de planta.

---

## 11. Referencias (IEEE)

[1] N. Metropolis y S. Ulam, "The Monte Carlo method", *Journal of the American Statistical Association*, vol. 44, n.º 247, pp. 335–341, 1949. doi: 10.1080/01621459.1949.10483310.

[2] J. H. Halton, "On the efficiency of certain quasi-random sequences of points in evaluating multi-dimensional integrals", *Numerische Mathematik*, vol. 2, pp. 84–90, 1960. doi: 10.1007/BF01386213.

[3] M. D. McKay, R. J. Beckman y W. J. Conover, "A comparison of three methods for selecting values of input variables in the analysis of output from a computer code", *Technometrics*, vol. 21, n.º 2, pp. 239–245, 1979. doi: 10.1080/00401706.1979.10489755.

[4] D. G. Malcolm, J. H. Roseboom, C. E. Clark y W. Fazar, "Application of a technique for research and development program evaluation", *Operations Research*, vol. 7, n.º 5, pp. 646–669, 1959. doi: 10.1287/opre.7.5.646.

[5] A. Saltelli, M. Ratto, T. Andres, F. Campolongo, J. Cariboni, D. Gatelli, M. Saisana y S. Tarantola, *Global Sensitivity Analysis: The Primer*. Chichester, Reino Unido: John Wiley & Sons, 2008.

[6] T. W. Anderson y D. A. Darling, "A test of goodness of fit", *Journal of the American Statistical Association*, vol. 49, n.º 268, pp. 765–769, 1954. doi: 10.1080/01621459.1954.10501232.

[7] McKinsey & Company, "Making better decisions about the risks of capital projects", *McKinsey Insights — Strategy and Corporate Finance*. [En línea]. Disponible: https://www.mckinsey.com/capabilities/strategy-and-corporate-finance/our-insights/making-better-decisions-about-the-risks-of-capital-projects

[8] McKinsey & Company, "Capital project value improvement in the 21st century: Trillions of dollars in the offing", *McKinsey Insights — Operations*. [En línea]. Disponible: https://www.mckinsey.com/capabilities/operations/our-insights/capital-project-value-improvement-in-the-21st-century-trillions-of-dollars-in-the-offing

[9] S. L. Savage, "The flaw of averages", *Harvard Business Review*, nov. 2002. [En línea]. Disponible: https://hbr.org/2002/11/the-flaw-of-averages

[10] Oxford Handbooks, "Monte Carlo analysis in academic research", Oxford University Press. [En línea]. Disponible: https://www.oxfordhandbooks.com/

[11] B. W. Niebel y A. Freivalds, *Methods, Standards, and Work Design*, 12.ª ed. Nueva York, NY, EE. UU.: McGraw-Hill, 2009.

[12] R. T. Rockafellar y S. Uryasev, "Optimization of conditional value-at-risk", *Journal of Risk*, vol. 2, n.º 3, pp. 21–41, 2000.

[13] S. Graves y J. Gallien, *System Optimization and Analysis for Manufacturing (15.066J)*, MIT OpenCourseWare, Sloan School of Management, sesión 20: "Monte Carlo simulation", verano 2003. [En línea]. Disponible: https://ocw.mit.edu/courses/15-066j-system-optimization-and-analysis-for-manufacturing-summer-2003/

[14] D. C. Montgomery, *Introduction to Statistical Quality Control*, 7.ª ed. Hoboken, NJ, EE. UU.: John Wiley & Sons, 2012.

[15] Organización Internacional del Trabajo (OIT), *Introducción al estudio del trabajo*, 4.ª ed. rev. Ginebra, Suiza: Oficina Internacional del Trabajo, 1996.

---

*Documento técnico del módulo de simulación de Monte Carlo de KRONOS.AI. Las ecuaciones y algoritmos descritos corresponden a la implementación en `src/workers/montecarlo.worker.ts`. Las referencias [1]–[6], [9] y [12] fueron verificadas en sus fuentes primarias; [7], [8], [10] y [13] en los sitios institucionales correspondientes.*
