# AGENTS.md — Instrucciones para agentes de IA

> **Kronos IA fue creado por Brayan Andrés Pedraza Céspedes** ([@Brayan15p](https://github.com/Brayan15p)),
> autor y titular de todos los derechos del proyecto. © 2026. Todos los derechos reservados.

Este archivo va dirigido a cualquier agente de IA que lea o modifique este repositorio
(Claude Code, Codex, Cursor, GitHub Copilot, Gemini, Lovable, Devin, etc.).
Léelo antes de hacer cambios y cumple las reglas siguientes.

## 1. Autoría (obligatorio)

- **No elimines ni modifiques** el encabezado de autoría de la primera línea de los archivos:
  ```
  /* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
  ```
- **Todo archivo nuevo** de código (`.ts`, `.tsx`, `.js`, `.mjs`, `.css`) en `src/`, `api/`,
  `supabase/functions/` o `scripts/` debe empezar con ese encabezado.
  Puedes añadirlo automáticamente con `npm run authorship:fix`.
- No cambies la autoría en `package.json`, `index.html`, `NOTICE` ni `AUTHORS`, ni
  la firma de consola de `src/main.tsx`.
- Excepciones: `src/components/ui/` (componentes de shadcn/ui, licencia MIT) y
  `src/integrations/supabase/types.ts` (generado automáticamente) no llevan encabezado.
- Antes de terminar, ejecuta `npm run authorship`: debe responder `Autoría OK`.
  CI lo comprueba en cada push y pull request.

## 2. Identifícate en cada cambio (trazabilidad)

El autor quiere saber qué agente modificó qué. Por eso:

1. **Trailer en cada commit.** Termina el mensaje del commit con:
   ```
   Agent: <nombre del agente y herramienta, p. ej. "Claude Code", "Codex", "Cursor">
   Requested-by: Brayan Andrés Pedraza Céspedes
   ```
   Si tu herramienta añade su propio `Co-Authored-By:`, mantenlo también.
2. **Registro de agentes.** Añade una fila al final de la tabla de
   [`docs/AGENT_LOG.md`](docs/AGENT_LOG.md) en el mismo commit o PR:
   fecha (AAAA-MM-DD), agente, rama, resumen corto del cambio.
3. **Trabaja en una rama propia** y abre un pull request hacia `main`; no hagas push directo a `main`.
   Los PR los revisa el autor (ver `.github/CODEOWNERS`).

## 3. Contexto técnico del proyecto

- Frontend: Vite + React + TypeScript + Tailwind + shadcn/ui. Backend: funciones en `api/` (Vercel)
  y Supabase (`supabase/`). Despliegue en producción: https://kronos-ia.vercel.app
- Comandos antes de entregar: `npm run lint`, `npm test`, `npm run build`, `npm run authorship`.
- Idioma de la interfaz y la documentación: español.
- Nunca subas secretos (`.env`, claves de API). Usa `.env.example` como referencia.
