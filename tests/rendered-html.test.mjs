import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("production build contains the Sites worker entry point", async () => {
  await access(new URL("dist/server/index.js", root));
  await access(new URL("dist/client", root));

  const hosting = JSON.parse(await read(".openai/hosting.json"));
  assert.equal(hosting.project_id, "appgprj_6a54aacae01c8191bb781431d4f99a78");
  assert.equal(hosting.d1, "DB");
});

test("application source contains production branding and no starter preview", async () => {
  const [page, layout, styles, packageJson, vite] = await Promise.all([
    read("app/page.tsx"),
    read("app/layout.tsx"),
    read("app/globals.css"),
    read("package.json"),
    read("vite.config.ts"),
  ]);

  assert.match(page, /Quiniela MNF/);
  assert.match(layout, /Quiniela MNF 2026/);
  assert.match(styles, /\.header-logo\s*\{[^}]*width:274\.12px/);
  assert.match(styles, /\.brand-copy h1\s*\{[^}]*font-family:var\(--font-sport\)/);
  assert.match(packageJson, /"name": "quiniela-mnf-2026"/);
  assert.match(vite, /sites\(\)/);
  assert.doesNotMatch(page + layout + styles, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("browser favicon is a transparent American football", async () => {
  const [layout, favicon] = await Promise.all([read("app/layout.tsx"), read("public/favicon.svg")]);

  assert.match(layout, /icons: \{ icon: \[\{ url: "\/favicon\.svg", type: "image\/svg\+xml" \}\], shortcut: "\/favicon\.svg" \}/);
  assert.match(favicon, /rotate\(-25 32 32\)/);
  assert.match(favicon, /fill="#9A4B23"/);
  assert.match(favicon, /stroke="#FFF9EC"/);
  assert.doesNotMatch(favicon, /<rect|background/);
});

test("treasury status is persisted, restricted and rendered in blue", async () => {
  const [page, boardApi, styles] = await Promise.all([
    read("app/page.tsx"),
    read("app/api/board/route.ts"),
    read("app/globals.css"),
  ]);

  assert.match(page, /"available" \| "reserved" \| "paid" \| "treasury"/);
  assert.match(page, /Tesorería/);
  assert.match(boardApi, /treasury_by_name/);
  assert.match(boardApi, /actor\.role === "user"[^\n]+\["paid", "treasury"\]/);
  assert.match(styles, /--treasury-blue:#2595ff/);
  assert.match(styles, /\.square\.treasury\s*\{[^}]*background:var\(--treasury-blue\)/);
  assert.match(styles, /@media\(max-width:700px\)[\s\S]*\.square-modal\s*\{[^}]*zoom:\.78/);
  assert.match(page, /type ReportRow = \{ name:string; reserved:number; paid:number; treasury:number; total:number \}/);
  assert.match(page, /\['treasury','Tesorería'\]/);
  assert.match(page, /\[row\.treasury,855,blue\]/);
  assert.match(page, /\[510,652,787,925\]\.forEach/);
});

test("square notes are an immutable history after a 20 minute edit window", async () => {
  const [page, boardApi, styles, schema, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/api/board/route.ts"),
    read("app/globals.css"),
    read("db/schema.ts"),
    read("drizzle/0009_faulty_goblin_queen.sql"),
  ]);

  assert.match(page, /type SquareNote = \{[^}]*status:Status; authorEmail:string; authorName:string; createdAt:string; updatedAt:string; editableUntil:string/);
  assert.match(page, /"note_create" \| "note_update" \| "note_delete"/);
  assert.match(page, /useState<"desc"\|"asc">\("desc"\)/);
  assert.match(page, /Bitácora de notas/);
  assert.match(page, /Nota No\. \{noteNumbers\.get\(note\.id\)\} \/ \{notes\.length\}/);
  assert.match(page, /maxLength=\{2000\}/);
  assert.doesNotMatch(page, /Teléfono|draft\.phone/);
  assert.match(boardApi, /unixepoch\(created_at\) \+ 1200/);
  assert.match(boardApi, /note\.authorEmail !== actor\.email/);
  assert.match(boardApi, /INSERT INTO square_notes[^\n]+square\.status, actor\.email, actor\.name/);
  assert.match(styles, /\.note-list \{[^}]*max-height:276px;overflow-y:auto/);
  assert.match(schema, /export const squareNotes = sqliteTable\("square_notes"/);
  assert.match(migration, /CREATE TABLE `square_notes`/);
});

test("square detail PDF includes branding, date and visitor-home ordering", async () => {
  const [page, styles, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/globals.css"),
    read("package.json"),
  ]);

  assert.match(packageJson, /"jspdf"/);
  assert.match(page, /import \{ jsPDF \} from "jspdf"/);
  assert.match(page, /📄 Generar PDF/);
  assert.match(page, /a\.visitor-b\.visitor\|\|a\.home-b\.home\|\|a\.square\.id-b\.square\.id/);
  assert.match(page, /localeCompare\(b\.square\.participant\|\|"Sin jugador","es"[\s\S]*a\.visitor-b\.visitor\|\|a\.home-b\.home/);
  assert.match(page, /QUINIELA MONDAY NIGHT FOOTBALL \$\{season\.name\}/);
  assert.match(page, /logo-crjc-white-gold\.png[\s\S]*logo-monday-night-football\.png[\s\S]*lema-rotario-2026-2027\.png/);
  assert.match(page, /\{day:"2-digit",month:"long",year:"numeric"\}/);
  assert.match(page, /CASILLA[\s\S]*VISITANTE[\s\S]*CASA[\s\S]*JUGADOR[\s\S]*SOCIO/);
  assert.match(page, /pagesPerRun=2,totalPages=reportRuns\.length\*pagesPerRun/);
  assert.match(page, /orderLabel:"VISITANTE — CASA"/);
  assert.match(page, /orderLabel:"JUGADOR — VISITANTE — CASA"/);
  assert.match(page, /CRITERIO DE ORDEN: \$\{orderLabel\}/);
  assert.match(page, /drawFooter\(globalPage,totalPages\)/);
  assert.match(page, /\$\{records\.length\} CASILLAS[\s\S]*GENERADO EL/);
  assert.match(styles, /\.detail-pdf-button/);
});

test("square dialog separates and highlights visitor and home game numbers", async () => {
  const [page, styles] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.doesNotMatch(page, /Nombre de quien juega<input autoFocus/);
  assert.match(page, /className="visitor-number"[\s\S]*<span>Visitante<\/span><em>\{visitorDigit\}<\/em>/);
  assert.match(page, /className="home-number"[\s\S]*<span>Casa<\/span><em>\{homeDigit\}<\/em>/);
  assert.match(styles, /\.square-matchup b \{[\s\S]*align-items:center[\s\S]*gap:9px/);
  assert.match(styles, /\.visitor-number>em \{ color:var\(--gold\)/);
  assert.match(styles, /\.home-number>em \{ color:#7ce6ad/);
});

test("winner flyer is available in Spanish and English", async () => {
  const [page, styles] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);

  assert.match(page, /"winner" \| "winner-en"/);
  assert.match(page, /onGenerateWinnerFlyer\(winner,"es"\)/);
  assert.match(page, /onGenerateWinnerFlyer\(winner,"en"\)/);
  assert.match(page, /Generate winner flyer in English/);
  assert.match(page, /WE HAVE A WINNER!/);
  assert.match(page, /FINAL SCORE · OVERTIME INCLUDED/);
  assert.match(page, /THANK YOU FOR PLAYING, WINNING AND HELPING!/);
  assert.match(page, /rotary-motto-2026-2027-en\.png/);
  assert.match(page, /mnf-football-pool-2026-winner-en\.png/);
  assert.match(page, /We have an MNF winner!/);
  assert.match(page, /const months:Record<string,string>=\{ene:"Jan"/);
  assert.match(page, /mottoAreaTop=1708,mottoAreaBottom=1888/);
  assert.match(page, /mottoScale=Math\.min\(mottoMaxW\/motto\.width,mottoMaxH\/motto\.height\)/);
  assert.match(styles, /\.winner-flyer-button-en/);
});

test("games and winners are combined in one Games surface", async () => {
  const page = await read("app/page.tsx");

  assert.doesNotMatch(page, /gamesView|games-switch/);
  assert.match(page, /className="games-list unified-games-list"/);
  assert.match(page, /className="game-outcome"/);
  assert.match(page, /CASILLA GANADORA/);
  assert.match(page, /Flyer ES/);
  assert.match(page, /Flyer EN/);
  assert.match(page, /className="report-card result-entry game-result-entry"/);
  assert.equal((page.match(/className="matchup-score"/g) ?? []).length, 2);
  assert.doesNotMatch(page, /className="game-final-score"/);
  assert.doesNotMatch(page, /Resultados? listos? para enviar|results-ready|games-ready/);
});

test("unified games keep the Games visual language and winner details", async () => {
  const styles = await read("app/globals.css");

  assert.match(styles, /\.unified-game \{[^}]*grid-template-rows/);
  assert.match(styles, /\.game-outcome \{[^}]*grid-column:1\/-1/);
  assert.match(styles, /\.matchup-score \{[^}]*background:var\(--navy\)/);
  assert.match(styles, /\.game-outcome \{ grid-template-columns:170px minmax\(150px,190px\) auto;justify-content:end/);
  assert.match(styles, /\.game-winning-square>div>strong/);
  assert.match(styles, /\.game-winner-tools \{ display:flex/);
});

test("member summary sorts every column and detail keeps square fixed", async () => {
  const [page, styles] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);

  assert.match(page, /type ReportSortKey = keyof ReportRow/);
  assert.match(page, /useState<\{key:ReportSortKey;direction:"asc"\|"desc"\}>\(\{key:"total",direction:"desc"\}\)/);
  assert.match(page, /\[\['name','Socio'\],\['reserved','Reservada'\],\['paid','Pagada'\],\['treasury','Tesorería'\],\['total','Total'\]\]/);
  assert.match(page, /aria-sort=\{summarySort\.key===key/);
  assert.match(styles, /\.drilldown-table \{[^}]*min-width:650px;table-layout:fixed;border-collapse:separate/);
  assert.match(styles, /\.drilldown-table th:nth-child\(1\) \{ width:82px;left:0;z-index:4/);
  assert.match(styles, /\.drilldown-table td:first-child \{ position:sticky;left:0/);
});

test("report tables keep their identifying first column fixed", async () => {
  const styles = await read("app/globals.css");

  assert.match(styles, /\.report-table th:first-child \{ position:sticky;left:0;z-index:3/);
  assert.match(styles, /\.report-table td:first-child \{ position:sticky;left:0;z-index:1/);
  assert.match(styles, /\.all-squares-table th:first-child \{ left:0;z-index:4;width:82px/);
  assert.match(styles, /\.all-squares-table td:first-child \{ position:sticky;left:0;z-index:1/);
});

test("administrative sections live in the Ajustes tab in the requested order", async () => {
  const [page, styles] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);

  assert.match(page, /tab === "settings" \? "active" : ""[\s\S]*>⚙<\/span> Ajustes<\/button>/);
  assert.match(page, /: "Reportes"}<\/button>[\s\S]*>i<\/span> Reglas<\/button>[\s\S]*>⚙<\/span> Ajustes<\/button>/);
  assert.match(page, /tab === "settings" && me\?\.role === "admin"[\s\S]*<Settings/);
  assert.match(page, /function Settings\(/);
  assert.match(page, /useState<"access"\|"season"\|"activity">\("access"\)/);
  assert.match(page, />Accesos[\s\S]*<\/button><button[\s\S]*>Temporada<\/button><button[\s\S]*>Actividad<\/button>/);
  assert.doesNotMatch(page, /reportView==="activity"|reportView==="access"|reportView==="season"/);
  assert.match(styles, /@media\(max-width:700px\)\{[\s\S]*\.member-list article \{ min-height:44px;grid-template-columns:minmax\(0,1fr\) auto auto/);
  assert.match(styles, /\.member-list article \.member-actions \{ grid-column:auto;display:flex;flex-wrap:nowrap/);
  assert.match(styles, /\.member-list \.member-actions button \{ width:26px;height:26px;padding:0;font-size:0/);
});

test("NFL results automation is secure, idempotent and visibly tracked", async () => {
  const [automation, mcp, board, page, hosting, schema, migration, oidc, endpoint, workflow] = await Promise.all([
    read("lib/nfl-results.ts"),
    read("app/mcp/route.ts"),
    read("app/api/board/route.ts"),
    read("app/page.tsx"),
    read(".openai/hosting.json"),
    read("db/schema.ts"),
    read("drizzle/0010_glorious_vermin.sql"),
    read("lib/github-oidc.ts"),
    read("app/api/automation/nfl-results/route.ts"),
    read(".github/workflows/sync-nfl-results.yml"),
  ]);

  assert.match(automation, /BALLDONTLIE_API_KEY/);
  assert.match(automation, /status_state/);
  assert.match(automation, /CONFIRMATION_DELAY_MS=5\*60\*1000/);
  assert.match(automation, /ON CONFLICT\(game_id\) DO NOTHING/);
  assert.match(automation, /Automatización de resultados/);
  assert.match(automation, /America\/Ciudad_Juarez/);
  assert.doesNotMatch(hosting, /BALLDONTLIE_API_KEY|api[_-]?key/i);
  assert.match(mcp, /sync_nfl_results/);
  assert.match(hosting, /"capabilities": \["mcp"\]/);
  assert.match(schema, /nflResultTracking/);
  assert.match(migration, /CREATE TABLE `nfl_result_tracking`/);
  assert.match(board, /nflSync:nflSyncResult\.results/);
  assert.doesNotMatch(page, /Resultados? listos? para enviar/);
  assert.match(page, /nflSyncLabel/);
  assert.match(page, /nfl-game-cards/);
  assert.match(page, /Marcador reportado por el proveedor/);
  assert.match(oidc, /EXPECTED_WORKFLOW=.*sync-nfl-results\.yml@refs\/heads\/main/);
  assert.match(oidc, /RSASSA-PKCS1-v1_5/);
  assert.match(endpoint, /verifyGitHubActionsToken/);
  assert.match(workflow, /cron: "17 4,5,6 \* \* 2"/);
  assert.match(workflow, /--retry 3/);
  assert.doesNotMatch(workflow, /sleep "\$\{retry_seconds\}"/);
  assert.match(workflow, /push:[\s\S]*branches: \[main\]/);
  assert.match(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /BALLDONTLIE_API_KEY/);
});
