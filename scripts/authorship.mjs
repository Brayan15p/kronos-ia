/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Verifica (o añade con --fix) el encabezado de autoría en el código fuente propio.
//   node scripts/authorship.mjs        → falla si algún archivo no lo tiene
//   node scripts/authorship.mjs --fix  → lo añade donde falte
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const AUTHOR = "Brayan Andrés Pedraza Céspedes";
const HEADER = `/* © 2026 ${AUTHOR} — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */`;

const DIRS = ["src", "api", "supabase/functions", "scripts"];
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|css)$/;
// Código de terceros o autogenerado: no se reclama su autoría (ver NOTICE).
const EXCLUDED = [/^src\/components\/ui\//, /^src\/integrations\/supabase\/types\.ts$/];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const fix = process.argv.includes("--fix");
const missing = [];

for (const dir of DIRS) {
  let files;
  try {
    files = walk(join(ROOT, dir));
  } catch {
    continue;
  }
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (!EXTENSIONS.test(rel) || EXCLUDED.some((re) => re.test(rel))) continue;
    const content = readFileSync(file, "utf8");
    if (content.split("\n", 5).some((line) => line.includes(AUTHOR))) continue;
    missing.push(rel);
    if (fix) writeFileSync(file, `${HEADER}\n${content}`);
  }
}

if (missing.length === 0) {
  console.log("Autoría OK: todos los archivos tienen el encabezado.");
} else if (fix) {
  console.log(`Encabezado añadido a ${missing.length} archivo(s).`);
} else {
  console.error(`Falta el encabezado de autoría en ${missing.length} archivo(s):`);
  for (const rel of missing) console.error(`  - ${rel}`);
  console.error("Ejecuta: npm run authorship:fix");
  process.exit(1);
}
