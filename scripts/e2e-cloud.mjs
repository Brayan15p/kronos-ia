// © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md
// Prueba de punta a punta de "Nube y equipo" contra un Supabase simulado (subconjunto de
// PostgREST y GoTrue). Compila la app apuntando a un dominio falso, la sirve e intercepta las
// peticiones HTTP reales del cliente de Supabase:
//   npm run test:e2e:cloud      (requiere navegadores de Playwright: npx playwright install chromium,
//                                o CHROMIUM_PATH=/ruta/a/chrome)
import { chromium } from "@playwright/test";
import { build, preview } from "vite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SB = "http://fake.supabase.test";
const USER = { id: "11111111-1111-1111-1111-111111111111", email: "duena@planta.co", aud: "authenticated", role: "authenticated",
  app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

// ── Supabase simulado (subconjunto de PostgREST + GoTrue que usa la app) ──
const db = { organizations: [], org_members: [], plants: [], studies: [] };
const log = [];
let n = 0; const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
function filters(url) {
  const f = [];
  for (const [k, v] of url.searchParams) if (!['select', 'order', 'columns'].includes(k) && v.startsWith('eq.')) f.push([k, v.slice(3)]);
  return f;
}
const match = (row, f) => f.every(([k, v]) => String(row[k]) === v);
function pick(row, select) { if (!select || select === '*') return row; const o = {}; for (const c of select.split(',')) o[c.trim()] = row[c.trim()]; return o; }

async function handle(route) {
  const req = route.request(); const url = new URL(req.url()); const path = url.pathname; const method = req.method();
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  log.push(`${method} ${path}${url.search}`);
  const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data),
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' } });
  if (method === 'OPTIONS') return json({}, 200);
  if (path === '/auth/v1/token') return json({ access_token: 'tok', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, refresh_token: 'r', user: USER });
  if (path === '/auth/v1/user') return json(USER);
  if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const out = (rows) => single ? (rows.length === 1 ? json(rows[0]) : json({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, 406)) : json(rows);
  if (path === '/rest/v1/rpc/create_organization') {
    const id = uuid(); db.organizations.push({ id, name: body.p_name.trim(), country: body.p_country, created_at: new Date().toISOString() });
    db.org_members.push({ org_id: id, user_id: USER.id, role: 'owner' }); return json(id);
  }
  if (path === '/rest/v1/rpc/list_org_members') return json(db.org_members.filter(m => m.org_id === body.p_org).map(m => ({ user_id: m.user_id, email: USER.email, role: m.role, created_at: '' })));
  const table = path.replace('/rest/v1/', ''); const rows = db[table]; const f = filters(url); const select = url.searchParams.get('select');
  if (!rows) return json({ message: 'tabla desconocida ' + table }, 404);
  if (method === 'GET') return out(rows.filter(r => match(r, f)).map(r => pick(r, select)));
  if (method === 'POST') {
    const items = (Array.isArray(body) ? body : [body]).map(r => ({ id: uuid(), version: 1, updated_at: new Date().toISOString(), city: '', station: '', plant_id: null, ...r }));
    rows.push(...items); return out(items.map(r => pick(r, select)));
  }
  if (method === 'PATCH') {
    const hit = rows.filter(r => match(r, f));
    for (const r of hit) Object.assign(r, body, table === 'studies' ? { version: r.version + 1, updated_at: new Date().toISOString() } : {});
    return out(hit.map(r => pick(r, select)));
  }
  if (method === 'DELETE') { db[table] = rows.filter(r => !match(r, f)); return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }); }
  return json({ message: 'no soportado' }, 400);
}

async function run(BASE) {
  // CHROMIUM_PATH permite usar un Chromium ya instalado si no coincide con la versión de Playwright
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', d => { console.log('  diálogo:', d.message().slice(0, 90)); d.accept(); });
  await page.route(SB + '/**', handle);
  const step = (s) => console.log('✔', s);

  // estudio local con 5 ciclos
  await page.goto(BASE + '/');
  await page.evaluate(() => {
    const cycles = Array.from({ length: 5 }, (_, i) => ({ id: 'c' + i, operatorId: 1, operatorName: 'Ana', cycleNumber: i + 1, duration: 60 + i, steps: [], timestamp: new Date().toISOString(), qualityPass: true, defects: [], notes: '' }));
    localStorage.setItem('kronos_timestudy_v1', JSON.stringify({ steps: [], operators: [{ id: 1, name: 'Ana', hourlyCost: 15000 }], cycles, defects: [], qualityChecks: [], costConfig: { productValue: 5000, targetCycleTime: 60, monthlyProductionTarget: 1000 } }));
  });
  await page.goto(BASE + '/#cloud'); await page.reload();
  await page.fill('#cloud-email', USER.email); await page.fill('#cloud-password', 'secreta123'); await page.click('button:has-text("Entrar")');
  await page.waitForSelector('text=Crea tu organización'); step('inicio de sesión → sin organizaciones → formulario de creación');

  await page.fill('[aria-label="Nombre de la organización"]', 'Confecciones Andina'); await page.click('button:has-text("Crear")');
  await page.waitForSelector('text=Administrador'); step('organización creada, rol Administrador');

  await page.fill('[aria-label="Nombre de la planta"]', 'Planta Bogotá'); await page.fill('[aria-label="Ciudad"]', 'Bogotá');
  await page.click('form:has([aria-label="Nombre de la planta"]) button'); await page.waitForSelector('li:has-text("Planta Bogotá")'); step('planta agregada');

  await page.fill('[aria-label="Nombre del estudio"]', 'Camiseta – Línea 1');
  await page.selectOption('[aria-label="Planta"]', { label: 'Planta Bogotá' });
  await page.click('button:has-text("Guardar como estudio nuevo")');
  await page.waitForSelector('text=Vinculado a'); await page.waitForSelector('text=5 ciclos · v1');
  const saved = db.studies[0]; if (saved.cycle_count !== 5 || saved.data.format !== 'kronos-study' || saved.data.data.cycles.length !== 5) throw new Error('estudio guardado mal: ' + JSON.stringify(saved).slice(0, 200));
  step('estudio guardado en la nube (v1, 5 ciclos, formato kronos-study, planta asignada: ' + (saved.plant_id === db.plants[0].id) + ')');

  // Otra persona guarda mientras tanto → conflicto → sobrescribir
  saved.version = 2;
  await page.click('button:has-text("Actualizar en la nube")');
  await page.waitForSelector('text=(versión 3)');
  const patches = log.filter(l => l.startsWith('PATCH /rest/v1/studies'));
  console.log('  PATCH enviados:', patches.map(p => decodeURIComponent(p).match(/version=eq\.\d+/)[0]).join(', '));
  if (!patches[0].includes('version=eq.1') || !patches[1].includes('version=eq.2')) throw new Error('filtros de versión incorrectos');
  step('conflicto detectado (versión 1 vs 2) y sobrescrito tras confirmar → versión 3');

  // La nube tiene una versión con 2 ciclos → abrirla reemplaza el estudio local
  saved.data.data.cycles = saved.data.data.cycles.slice(0, 2);
  await page.click('li:has-text("Camiseta – Línea 1") button:has-text("Abrir")');
  await page.waitForSelector('text=2 ciclos registrados'); step('abrir desde la nube reemplaza el estudio local (2 ciclos)');

  await page.click('button:has-text("Salir")'); await page.waitForSelector('text=Inicia sesión'); step('cerrar sesión');
  console.log('errores en consola:', errors.length ? errors : 'ninguno');
  await browser.close();
  if (errors.length) throw new Error('errores en consola');
}

const outDir = mkdtempSync(join(tmpdir(), "kronos-e2e-"));
process.env.VITE_SUPABASE_URL = SB;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "clave-publica-de-prueba";
let server;
try {
  await build({ logLevel: "warn", build: { outDir, emptyOutDir: true } });
  server = await preview({ preview: { host: "127.0.0.1", port: 0 }, build: { outDir } });
  const { port } = server.httpServer.address();
  await run(`http://127.0.0.1:${port}`);
  console.log("Prueba de nube: OK");
} catch (e) {
  console.error("Prueba de nube: FALLÓ —", e.message);
  process.exitCode = 1;
} finally {
  await new Promise((r) => (server ? server.httpServer.close(r) : r()));
  rmSync(outDir, { recursive: true, force: true });
}
