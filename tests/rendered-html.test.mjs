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
  assert.match(page, /<th>Tesorería<\/th>/);
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

test("winners tab is located in the Games section", async () => {
  const page = await read("app/page.tsx");

  assert.match(page, /function Games\([\s\S]*useState<"calendar"\|"winners">\("calendar"\)/);
  assert.match(page, /gamesView==="calendar"[\s\S]*>Juegos<\/button><button[\s\S]*gamesView==="winners"[\s\S]*>Ganadores<\/button>/);
  assert.match(page, /gamesView==="winners"&&<div className="winners-view">/);
  assert.doesNotMatch(page, /reportView==="winners"/);
});
