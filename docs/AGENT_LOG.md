# Registro de agentes de IA

Proyecto de **Brayan Andrés Pedraza Céspedes**. Cada agente de IA que modifique el repositorio
añade una fila al final de esta tabla (ver [AGENTS.md](../AGENTS.md)).

Para ver los commits de cada agente: `git log --grep="^Agent:"` o `git log --format="%h %ad %(trailers:key=Agent,valueonly) %s" --date=short`.

| Fecha | Agente | Rama | Cambio |
|---|---|---|---|
| 2026-10-30 | Claude Code | `claude-code/upbeat-mccarthy-urf0ml` | Encabezados de autoría, AGENTS.md, CLAUDE.md, NOTICE, AUTHORS, CODEOWNERS, registro de agentes y verificación en CI |
| 2026-10-30 | Claude Code | `claude-code/upbeat-mccarthy-urf0ml` | Seguridad (endpoint de IA, RLS en Supabase), ciclos automáticos en Vision AI, plantillas de proceso, respaldo del estudio, navegación por tarea, carga bajo demanda, lint y tests, investigación de mercado y hoja de ruta |
| 2026-10-30 | Claude Code (subagente) | `claude-code/upbeat-mccarthy-urf0ml` | Lint sin errores, tipos de MediaPipe, worker de Monte Carlo testeable y 31 tests de su matemática; detectó el error del análisis de Sobol |
| 2026-10-31 | Claude Code | `claude-code/upbeat-mccarthy-urf0ml` | Cuentas y nube (organización → plantas → estudios, roles, concurrencia optimista), pruebas de permisos en Postgres, prueba de nube en navegador, CI completo y corrección de fuentes |
| 2026-10-31 | Claude Code (subagente) | `claude-code/upbeat-mccarthy-urf0ml` | Ergonomía con confianza: confianza por segmento, detección de vista lateral/frontal, REBA y tests; detectó el error de ángulos del RULA |
| 2026-10-31 | Claude Code (subagente) | `claude-code/upbeat-mccarthy-urf0ml` | RULA según McAtamney & Corlett (1993) con tablas A/B/C, geometría corporal compartida con REBA y tests de corrección |
| 2026-10-31 | Claude Code | `claude-code/upbeat-mccarthy-urf0ml` | Neon como base de datos principal (Neon Auth + Data API), esquema portátil Neon/Supabase y pruebas de permisos en ambos modos |
| 2026-10-31 | Claude Code (subagente) | `claude-code/upbeat-mccarthy-urf0ml` | Paquete SG-SST: evaluaciones, matriz GTC 45:2012, mediciones, plan de acción, PDF de evidencias, CSV y 28 tests |
| 2026-10-31 | Claude Code | `claude-code/upbeat-mccarthy-urf0ml` | Dosis de ruido según Res. 1792/1990 (5 dB), CSV del Centro de Mando con escape correcto, etiquetas sin "Cumple" |
