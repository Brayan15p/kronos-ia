# Kronos IA

> Creado por **Brayan Andrés Pedraza Céspedes** (© 2026, todos los derechos reservados). Ver [NOTICE](NOTICE).
> Si eres un agente de IA, lee primero [AGENTS.md](AGENTS.md).

**Inteligencia industrial para procesos manuales.** Kronos convierte la observación de un puesto de
trabajo —con cronómetro o con la cámara de un celular— en tiempo estándar, capacidad del proceso,
riesgo económico y evaluación ergonómica, en español y para pymes.

Producción: **https://kronos-ia.vercel.app**

## Qué hace

| Tarea | Módulos |
|---|---|
| **Medir** | Cronómetro por pasos, **Vision AI** (postura RULA, therbligs, gestos y **ciclos automáticos** desde el esqueleto), entrada manual, calidad, defectos, plantillas de proceso |
| **Analizar** | KPI Center (OEE, alertas), **Monte Carlo** (Quasi-Monte Carlo, Cpk/Ppk, DPMO, Sobol, VaR/CVaR), costo de la ineficiencia, fatiga y entrenamiento |
| **Mejorar** | Optimizador con IA, incentivos |
| **Ergonomía y SST** | Centro de mando, radar ambiental (lux/ruido), visión operativa 3D, costo ergonómico, recomendaciones con IA |
| **Reportar** | Dashboard y reporte PDF |
| **Equipo** | Cuentas, organización → plantas → estudios en la nube, roles (administrador, editor, lector) |

La visión por computador (MediaPipe) corre **en el navegador**: el video no sale del dispositivo.
El estudio se guarda en el navegador, se puede **respaldar y restaurar** como archivo y, con una
cuenta, **compartir con el equipo en la nube** (solo métricas, nunca video).

## Desarrollo

Requisitos: Node.js 20+ y npm.

```bash
npm install
npm run dev          # http://localhost:8080
```

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm test` | Tests (Vitest) |
| `npm run test:db` | Migraciones y permisos (RLS) en un Postgres temporal (requiere Postgres 15+) |
| `npm run test:e2e:cloud` | Flujo completo de "Nube y equipo" en navegador contra un Supabase simulado |
| `npm run lint` | ESLint |
| `npm run authorship` | Verifica los encabezados de autoría (`authorship:fix` los añade) |

Variables de entorno: copia [`.env.example`](.env.example) a `.env`. El asesor de IA necesita
`OPENROUTER_API_KEY` en Vercel; `LLM_MODELS` permite elegir modelos de pago para clientes.

## Arquitectura

- **Frontend:** Vite + React + TypeScript + Tailwind + shadcn/ui. Cada módulo se carga bajo demanda.
- **Estado:** `src/context/` (estudio de tiempos y SST), persistido en `localStorage`.
- **Lógica pura y testeada:** `src/lib/` (detector de ciclos, respaldo, plantillas) y
  `src/workers/montecarlo.worker.ts` (simulación en un hilo aparte).
- **IA:** `api/llm-interpret.ts` (Vercel Edge, OpenRouter con streaming) y
  `supabase/functions/sst-recommendations`.
- **Base de datos:** Supabase (`supabase/migrations/`): organizaciones, miembros con rol, plantas y
  estudios con control de versión (concurrencia optimista). Permisos probados en `supabase/tests/`.
- **Nube:** `src/lib/cloud.ts` (sin variables de Supabase, la app funciona solo en local).

### Base de datos en producción

Aplica las migraciones **en orden** desde el editor SQL de Supabase (o con `supabase db push`):

1. `20260530_kronos_cloud.sql`
2. `20261030_secure_rls.sql`
3. `20261031_organizations.sql`

En Supabase → Authentication → URL Configuration, pon `https://kronos-ia.vercel.app` como Site URL
para que el enlace de confirmación de correo vuelva a la app.

## Documentación

- [Hoja de ruta](docs/ROADMAP.md)
- [Mercado y estado del arte](docs/investigacion-mercado-y-estado-del-arte.md)
- [Paper: simulación Monte Carlo en Kronos](docs/paper-montecarlo-kronos.md)
- [Registro de agentes de IA](docs/AGENT_LOG.md)
