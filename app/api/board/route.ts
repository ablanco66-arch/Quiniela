import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureLocalAuthSchema, getLocalActor, hashPassword, normalizeUsername, validPassword, validUsername } from "../../lib/local-auth";

type Role = "admin" | "user" | "treasury";
type SeedSquare = { id: number; status: "reserved" | "paid"; participant: string; contact: string };
type Actor = { email: string; name: string; role: Role; authProvider: "local" | "chatgpt" };
type Game = { date: string; visitor: string; home: string };
type SeasonConfig = { name: string; squarePrice: number; gamePrize: number; paymentDeadline: string; games: Game[] };
const INITIAL_ADMIN_EMAIL = "ablanco66@gmail.com";
const INITIAL_ADMIN_NAME = "Andrés Blanco";
const MEMBER_LIST_SQL = "SELECT email, name, role, active, COALESCE(username, '') AS username, approval_status AS approvalStatus, must_change_password AS mustChangePassword FROM members ORDER BY CASE approval_status WHEN 'pending' THEN 0 ELSE 1 END, name, email";
const DEFAULT_GAMES: Game[] = [
  { date:"14 sep", visitor:"Denver Broncos", home:"Kansas City Chiefs" }, { date:"21 sep", visitor:"New York Giants", home:"Los Angeles Rams" },
  { date:"28 sep", visitor:"Philadelphia Eagles", home:"Chicago Bears" }, { date:"5 oct", visitor:"Atlanta Falcons", home:"New Orleans Saints" },
  { date:"12 oct", visitor:"Buffalo Bills", home:"Los Angeles Rams" }, { date:"19 oct", visitor:"Washington Commanders", home:"San Francisco 49ers" },
  { date:"26 oct", visitor:"Dallas Cowboys", home:"Philadelphia Eagles" }, { date:"2 nov", visitor:"Chicago Bears", home:"Seattle Seahawks" },
  { date:"9 nov", visitor:"Buffalo Bills", home:"Minnesota Vikings" }, { date:"16 nov", visitor:"Los Angeles Chargers", home:"Baltimore Ravens" },
  { date:"23 nov", visitor:"Cincinnati Bengals", home:"Washington Commanders" }, { date:"30 nov", visitor:"Carolina Panthers", home:"Tampa Bay Buccaneers" },
  { date:"7 dic", visitor:"Dallas Cowboys", home:"Seattle Seahawks" }, { date:"14 dic", visitor:"Pittsburgh Steelers", home:"Jacksonville Jaguars" },
  { date:"21 dic", visitor:"New England Patriots", home:"Kansas City Chiefs" }, { date:"28 dic", visitor:"New York Giants", home:"Detroit Lions" },
  { date:"4 ene", visitor:"Houston Texans", home:"Green Bay Packers" },
];

const occupied: SeedSquare[] = [
  [4,"reserved","Cabiria Flores","Cabi Flores"],[5,"reserved","Eduardo Cinco","Yamel Guillén"],[6,"reserved","Jaime Chávez","Mario Blanco"],[7,"reserved","Jay Marcel","Gabriel Barbosa"],[9,"reserved","María Xóchitl Sánchez","María Xóchitl Sánchez"],[11,"reserved","Rubén de Santiago","Yamel Guillén"],[13,"reserved","Omar Apodaca","Yamel Guillén"],[16,"reserved","Daniel de la Rosa","Angie de la Rosa"],[17,"reserved","Rosa Ávila","Angie de la Rosa"],[18,"paid","José Calderón","Darío Sánchez"],[21,"reserved","Roberto Martínez","Angie de la Rosa"],[22,"paid","Rosa Ma. Espinoza","Mario Blanco"],[24,"reserved","Manolo Papadakis","Mario Blanco"],[25,"reserved","Efrén Páramo","Myrna Sandoval"],[26,"reserved","Irma de Alvarado","Mario Blanco · CR Cd. Juárez"],[29,"reserved","Juan Carlos Márquez","Darío Sánchez"],[30,"reserved","Roberto de la Rosa","Angie de la Rosa"],[33,"reserved","Felipe Meza","Mario Blanco · CRJ Ejecutivo"],[34,"reserved","Javo Murguía","Mario Blanco"],[35,"reserved","Javier Guillén","Yamel Guillén"],[37,"reserved","Edith Manríquez","Edith Manríquez"],[40,"paid","Alejandro Arrieta","Darío Sánchez"],[43,"reserved","Juan Carlos Olivares","JC Olivares"],[44,"reserved","Nidia de la Rosa","Angie de la Rosa"],[45,"reserved","Jesús Cansino","Yamel Guillén"],[47,"reserved","Charly Coutiño","Myrna Sandoval"],[48,"paid","Rosa Ma. Espinoza","Glafira Manríquez"],[50,"reserved","Marty Class","Edith Manríquez"],[54,"reserved","Enrique Luján","Mario Blanco"],[55,"reserved","Richy Cabada","Angie de la Rosa"],[57,"reserved","Cindy Holguín","Darío Sánchez"],[58,"reserved","Daniel Martínez","Mario Blanco · CRJ Siglo XXI"],[64,"reserved","Guillermo Huerta","Glafira Manríquez · CRJ S. XXI"],[65,"reserved","Laura de la Rosa","Angie de la Rosa"],[66,"reserved","Felipe Meza","Mario Blanco · CRJ Ejecutivo"],[67,"reserved","Jay Marcel","Gabriel Barbosa"],[72,"reserved","Jimmy Holguín","Mario Blanco · CR Cd. Juárez"],[76,"paid","Andrés Blanco","Glafira Manríquez"],[85,"paid","Teófilo Ugalde","Mario Blanco"],[90,"reserved","David Jiménez","Angie de la Rosa"],[96,"paid","Adriana Galván","Edith Manríquez"],[98,"paid","Andrés Blanco","Mario Blanco"],[99,"reserved","Andrés Iglesias","Mario Blanco"],[100,"reserved","Betzabel Tobías","Betzabel Tobías"],
].map(([id,status,participant,contact]) => ({ id: id as number, status: status as "reserved"|"paid", participant: participant as string, contact: contact as string }));

async function ensureDatabase() {
  const db = env.DB;
  await ensureLocalAuthSchema();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS squares (id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'available', participant TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', reserved_by_email TEXT NOT NULL DEFAULT '', reserved_by_name TEXT NOT NULL DEFAULT '', reserved_at TEXT NOT NULL DEFAULT '', paid_by_email TEXT NOT NULL DEFAULT '', paid_by_name TEXT NOT NULL DEFAULT '', paid_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), visitor_digits TEXT NOT NULL DEFAULT '', home_digits TEXT NOT NULL DEFAULT '', season_name TEXT NOT NULL DEFAULT '2026', square_price INTEGER NOT NULL DEFAULT 100, game_prize INTEGER NOT NULL DEFAULT 300, payment_deadline TEXT NOT NULL DEFAULT '2026-09-14', games_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, square_id INTEGER, action TEXT NOT NULL, actor_email TEXT NOT NULL, actor_name TEXT NOT NULL, actor_role TEXT NOT NULL, previous_status TEXT NOT NULL DEFAULT '', new_status TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS activity_created_id_idx ON activity (created_at DESC, id DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS game_results (game_id INTEGER PRIMARY KEY, visitor_score INTEGER NOT NULL, home_score INTEGER NOT NULL, updated_by_email TEXT NOT NULL DEFAULT '', updated_by_name TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS season_archives (id INTEGER PRIMARY KEY AUTOINCREMENT, season_name TEXT NOT NULL, square_price INTEGER NOT NULL, game_prize INTEGER NOT NULL, payment_deadline TEXT NOT NULL DEFAULT '', games_json TEXT NOT NULL, squares_json TEXT NOT NULL, results_json TEXT NOT NULL, visitor_digits TEXT NOT NULL DEFAULT '', home_digits TEXT NOT NULL DEFAULT '', archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS season_archives_archived_id_idx ON season_archives (archived_at DESC, id DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS members_name_active_approval_idx ON members (name, active, approval_status)`),
  ]);
  await db.prepare("INSERT OR IGNORE INTO members (email, name, role, active) VALUES (?, ?, 'admin', 1)").bind(INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_NAME).run();

  const info = await db.prepare("PRAGMA table_info(squares)").all();
  const columns = new Set((info.results as Array<{ name: string }>).map((column) => column.name));
  const additions = [
    ["reserved_by_email", "ALTER TABLE squares ADD COLUMN reserved_by_email TEXT NOT NULL DEFAULT ''"],
    ["reserved_by_name", "ALTER TABLE squares ADD COLUMN reserved_by_name TEXT NOT NULL DEFAULT ''"],
    ["reserved_at", "ALTER TABLE squares ADD COLUMN reserved_at TEXT NOT NULL DEFAULT ''"],
    ["paid_by_email", "ALTER TABLE squares ADD COLUMN paid_by_email TEXT NOT NULL DEFAULT ''"],
    ["paid_by_name", "ALTER TABLE squares ADD COLUMN paid_by_name TEXT NOT NULL DEFAULT ''"],
    ["paid_at", "ALTER TABLE squares ADD COLUMN paid_at TEXT NOT NULL DEFAULT ''"],
  ].filter(([name]) => !columns.has(name));
  if (additions.length) await db.batch(additions.map(([, sql]) => db.prepare(sql)));

  const settingsInfo = await db.prepare("PRAGMA table_info(settings)").all();
  const settingsColumns = new Set((settingsInfo.results as Array<{ name:string }>).map((column) => column.name));
  const settingsAdditions = [
    ["season_name", "ALTER TABLE settings ADD COLUMN season_name TEXT NOT NULL DEFAULT '2026'"],
    ["square_price", "ALTER TABLE settings ADD COLUMN square_price INTEGER NOT NULL DEFAULT 100"],
    ["game_prize", "ALTER TABLE settings ADD COLUMN game_prize INTEGER NOT NULL DEFAULT 300"],
    ["payment_deadline", "ALTER TABLE settings ADD COLUMN payment_deadline TEXT NOT NULL DEFAULT '2026-09-14'"],
    ["games_json", "ALTER TABLE settings ADD COLUMN games_json TEXT NOT NULL DEFAULT '[]'"],
  ].filter(([name]) => !settingsColumns.has(name));
  if (settingsAdditions.length) await db.batch(settingsAdditions.map(([, sql]) => db.prepare(sql)));

  const count = await db.prepare("SELECT COUNT(*) AS total FROM squares").first<{ total: number }>();
  if (!count?.total) {
    const byId = new Map(occupied.map((square) => [square.id, square]));
    const now = new Date().toISOString();
    await db.batch(Array.from({ length: 100 }, (_, index) => {
      const id = index + 1;
      const square = byId.get(id);
      const seller = sellerName(square?.contact ?? "");
      return db.prepare(`INSERT INTO squares (id, status, participant, contact, phone, reserved_by_name, reserved_at, paid_by_name, paid_at) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)`)
        .bind(id, square?.status ?? "available", square?.participant ?? "", seller, seller, square ? now : "", square?.status === "paid" ? "Registro inicial" : "", square?.status === "paid" ? now : "");
    }));
  }

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO settings (id, visitor_digits, home_digits) VALUES (1, '', '')"),
    db.prepare("UPDATE settings SET games_json = ? WHERE id = 1 AND (games_json = '' OR games_json = '[]')").bind(JSON.stringify(DEFAULT_GAMES)),
    db.prepare(`UPDATE squares SET reserved_by_name = CASE WHEN instr(contact, ' · ') > 0 THEN trim(substr(contact, 1, instr(contact, ' · ') - 1)) ELSE trim(contact) END, reserved_at = CASE WHEN reserved_at = '' THEN updated_at ELSE reserved_at END WHERE status <> 'available' AND reserved_by_name = ''`),
    db.prepare(`UPDATE squares SET reserved_by_name = CASE reserved_by_name WHEN 'JC Olivares' THEN 'Juan Carlos Olivares' WHEN 'Cabi Flores' THEN 'Cabiria Flores' ELSE reserved_by_name END WHERE reserved_by_name IN ('JC Olivares', 'Cabi Flores')`),
    db.prepare(`UPDATE squares SET paid_by_name = 'Registro inicial', paid_at = CASE WHEN paid_at = '' THEN updated_at ELSE paid_at END WHERE status = 'paid' AND paid_by_name = ''`),
  ]);
}

async function getActor(request: Request): Promise<Actor | Response> {
  const localActor = await getLocalActor(request);
  if (localActor?.mustChangePassword) return Response.json({ error:"Debes cambiar la contraseña temporal antes de continuar", code:"PASSWORD_CHANGE_REQUIRED" }, { status:428 });
  if (localActor) return localActor;
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Inicia sesión para continuar", code: "AUTH_REQUIRED" }, { status: 401 });
  await ensureDatabase();
  const email = user.email.trim().toLowerCase();
  const member = await env.DB.prepare("SELECT email, name, role, active FROM members WHERE email = ?").bind(email).first<{ email: string; name: string; role: Role; active: number }>();
  if (!member?.active) return Response.json({ error: "Tu cuenta no está autorizada para esta quiniela", code: "ACCESS_DENIED", email }, { status: 403 });
  return { email: member.email, name: member.name || user.displayName, role: member.role, authProvider: "chatgpt" };
}

export async function GET(request: Request) {
  try {
    const actor = await getActor(request);
    if (actor instanceof Response) return actor;
    const [squareResult, settings, memberResult, activityResult, gameResult, archiveResult] = await Promise.all([
      env.DB.prepare(`SELECT id, status, participant, contact, phone, reserved_by_email AS reservedByEmail, reserved_by_name AS reservedByName, reserved_at AS reservedAt, paid_by_email AS paidByEmail, paid_by_name AS paidByName, paid_at AS paidAt FROM squares ORDER BY id`).all(),
      env.DB.prepare("SELECT visitor_digits AS visitorDigits, home_digits AS homeDigits, season_name AS seasonName, square_price AS squarePrice, game_prize AS gamePrize, payment_deadline AS paymentDeadline, games_json AS gamesJson FROM settings WHERE id = 1").first<Record<string, string | number>>(),
      actor.role === "admin" ? env.DB.prepare(MEMBER_LIST_SQL).all() : Promise.resolve({ results: [] }),
      actor.role === "admin" ? env.DB.prepare("SELECT id, square_id AS squareId, action, actor_name AS actorName, actor_role AS actorRole, previous_status AS previousStatus, new_status AS newStatus, details, created_at AS createdAt FROM activity ORDER BY created_at DESC, id DESC LIMIT 60").all() : Promise.resolve({ results: [] }),
      env.DB.prepare("SELECT game_id AS gameId, visitor_score AS visitorScore, home_score AS homeScore, updated_by_name AS updatedByName, updated_at AS updatedAt FROM game_results ORDER BY game_id").all(),
      actor.role === "admin" ? env.DB.prepare("SELECT id, season_name AS seasonName, square_price AS squarePrice, game_prize AS gamePrize, games_json AS gamesJson, archived_at AS archivedAt FROM season_archives ORDER BY archived_at DESC, id DESC LIMIT 12").all() : Promise.resolve({ results: [] }),
    ]);
    const games = parseGames(String(settings?.gamesJson ?? ""));
    const season = { name:String(settings?.seasonName ?? "2026"), squarePrice:Number(settings?.squarePrice ?? 100), gamePrize:Number(settings?.gamePrize ?? 300), paymentDeadline:String(settings?.paymentDeadline ?? "2026-09-14"), games };
    const archives = (archiveResult.results as Array<Record<string, unknown>>).map((item) => ({ id:item.id, seasonName:item.seasonName, squarePrice:item.squarePrice, gamePrize:item.gamePrize, archivedAt:item.archivedAt, gameCount:parseGames(String(item.gamesJson ?? "")).length }));
    return Response.json({ squares: squareResult.results, settings:{ visitorDigits:settings?.visitorDigits ?? "", homeDigits:settings?.homeDigits ?? "" }, season, archives, me: actor, members: memberResult.results, activity: activityResult.results, gameResults: gameResult.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar el tablero" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await getActor(request);
    if (actor instanceof Response) return actor;
    const payload = await request.json() as Record<string, unknown>;

    if (payload.action === "season_save" || payload.action === "season_activate") {
      if (actor.role !== "admin") return forbidden();
      const season = validateSeason(payload.season);
      if (!season) return Response.json({ error:"Completa el nombre de temporada, costo, premio y todos los datos de los juegos" }, { status:400 });
      if (payload.action === "season_save") {
        await env.DB.batch([
          env.DB.prepare("UPDATE settings SET season_name = ?, square_price = ?, game_prize = ?, payment_deadline = ?, games_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1").bind(season.name, season.squarePrice, season.gamePrize, season.paymentDeadline, JSON.stringify(season.games)),
          activity(actor, null, "season_updated", "", "", `${season.name} · ${season.games.length} juegos`),
        ]);
        return Response.json({ season });
      }
      const current = await env.DB.prepare("SELECT visitor_digits AS visitorDigits, home_digits AS homeDigits, season_name AS seasonName, square_price AS squarePrice, game_prize AS gamePrize, payment_deadline AS paymentDeadline, games_json AS gamesJson FROM settings WHERE id = 1").first<Record<string, string | number>>();
      if (String(payload.confirmSeasonName ?? "") !== String(current?.seasonName ?? "")) return Response.json({ error:"Confirma la temporada actual antes de iniciar una nueva" }, { status:400 });
      const [squareSnapshot, resultSnapshot] = await Promise.all([
        env.DB.prepare("SELECT * FROM squares ORDER BY id").all(),
        env.DB.prepare("SELECT * FROM game_results ORDER BY game_id").all(),
      ]);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO season_archives (season_name, square_price, game_prize, payment_deadline, games_json, squares_json, results_json, visitor_digits, home_digits) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(String(current?.seasonName ?? ""), Number(current?.squarePrice ?? 100), Number(current?.gamePrize ?? 300), String(current?.paymentDeadline ?? ""), JSON.stringify(parseGames(String(current?.gamesJson ?? ""))), JSON.stringify(squareSnapshot.results), JSON.stringify(resultSnapshot.results), String(current?.visitorDigits ?? ""), String(current?.homeDigits ?? "")),
        env.DB.prepare("UPDATE squares SET status = 'available', participant = '', contact = '', phone = '', reserved_by_email = '', reserved_by_name = '', reserved_at = '', paid_by_email = '', paid_by_name = '', paid_at = '', updated_at = CURRENT_TIMESTAMP"),
        env.DB.prepare("DELETE FROM game_results"),
        env.DB.prepare("UPDATE settings SET visitor_digits = '', home_digits = '', season_name = ?, square_price = ?, game_prize = ?, payment_deadline = ?, games_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1").bind(season.name, season.squarePrice, season.gamePrize, season.paymentDeadline, JSON.stringify(season.games)),
        activity(actor, null, "season_activated", String(current?.seasonName ?? ""), season.name, `${season.games.length} juegos · tablero reiniciado`),
      ]);
      return Response.json({ season, activated:true });
    }

    if (payload.action === "digits") {
      if (actor.role !== "admin") return forbidden();
      const visitorDigits = String(payload.visitorDigits ?? "");
      const homeDigits = String(payload.homeDigits ?? "");
      if (![visitorDigits, homeDigits].every((value) => value === "" || validDigits(value))) return Response.json({ error: "Dígitos inválidos" }, { status: 400 });
      await env.DB.batch([
        env.DB.prepare("UPDATE settings SET visitor_digits = ?, home_digits = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1").bind(visitorDigits, homeDigits),
        activity(actor, null, "numbers_updated", "", "", "Números de juego actualizados"),
      ]);
      return Response.json({ settings: { visitorDigits, homeDigits } });
    }

    if (payload.action === "game_result") {
      if (actor.role !== "admin") return forbidden();
      const gameId = Number(payload.gameId), visitorScore = Number(payload.visitorScore), homeScore = Number(payload.homeScore);
      const gameCount = await currentGameCount();
      if (!Number.isInteger(gameId) || gameId < 1 || gameId > gameCount || !Number.isInteger(visitorScore) || visitorScore < 0 || visitorScore > 999 || !Number.isInteger(homeScore) || homeScore < 0 || homeScore > 999) return Response.json({ error:"Resultado de juego inválido" }, { status:400 });
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO game_results (game_id, visitor_score, home_score, updated_by_email, updated_by_name, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(game_id) DO UPDATE SET visitor_score = excluded.visitor_score, home_score = excluded.home_score, updated_by_email = excluded.updated_by_email, updated_by_name = excluded.updated_by_name, updated_at = CURRENT_TIMESTAMP`).bind(gameId, visitorScore, homeScore, actor.email, actor.name),
        activity(actor, null, "game_result_updated", "", "", `Juego ${gameId}: ${visitorScore}-${homeScore}`),
      ]);
      const gameResult = await env.DB.prepare("SELECT game_id AS gameId, visitor_score AS visitorScore, home_score AS homeScore, updated_by_name AS updatedByName, updated_at AS updatedAt FROM game_results WHERE game_id = ?").bind(gameId).first();
      return Response.json({ gameResult });
    }

    if (payload.action === "game_result_clear") {
      if (actor.role !== "admin") return forbidden();
      const gameId = Number(payload.gameId);
      if (!Number.isInteger(gameId) || gameId < 1 || gameId > await currentGameCount()) return Response.json({ error:"Juego inválido" }, { status:400 });
      const existing = await env.DB.prepare("SELECT game_id FROM game_results WHERE game_id = ?").bind(gameId).first();
      if (existing) await env.DB.batch([
        env.DB.prepare("DELETE FROM game_results WHERE game_id = ?").bind(gameId),
        activity(actor, null, "game_result_cleared", "", "", `Juego ${gameId}`),
      ]);
      return Response.json({ gameId, cleared:Boolean(existing) });
    }

    if (payload.action === "game_results_clear_all") {
      if (actor.role !== "admin") return forbidden();
      const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM game_results").first<{ total:number }>();
      if (Number(count?.total ?? 0) > 0) await env.DB.batch([
        env.DB.prepare("DELETE FROM game_results"),
        activity(actor, null, "game_results_cleared", "", "", `${count?.total ?? 0} resultados`),
      ]);
      return Response.json({ cleared:Number(count?.total ?? 0) });
    }

    if (payload.action === "member_create_local") {
      if (actor.role !== "admin") return forbidden();
      const name = String(payload.name ?? "").trim();
      const username = normalizeUsername(String(payload.username ?? ""));
      const temporaryPassword = String(payload.tempPassword ?? "");
      const role = String(payload.role ?? "user") as Role;
      const active = payload.active === false ? 0 : 1;
      if (name.length < 3 || name.length > 80 || !validUsername(username) || !validPassword(temporaryPassword) || !["admin","user","treasury"].includes(role)) return Response.json({ error:"La contraseña temporal debe tener al menos 8 caracteres, una minúscula, una mayúscula, un número y un símbolo especial" }, { status:400 });
      const duplicate = await env.DB.prepare("SELECT email FROM members WHERE username = ?").bind(username).first();
      if (duplicate) return Response.json({ error:"Ese nombre de usuario ya está registrado" }, { status:409 });
      const credentials = await hashPassword(temporaryPassword);
      const email = `local:${crypto.randomUUID()}`;
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO members (email, name, role, active, username, password_salt, password_hash, approval_status, must_change_password)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`).bind(email, name, role, active, username, credentials.salt, credentials.hash, active ? "approved" : "suspended"),
        activity(actor, null, "member_updated", "", "", `${name} · ${roleLabel(role)} · cuenta propia creada`),
      ]);
      const members = await env.DB.prepare(MEMBER_LIST_SQL).all();
      return Response.json({ members:members.results, created:true });
    }

    if (payload.action === "member") {
      if (actor.role !== "admin") return forbidden();
      const email = String(payload.email ?? "").trim().toLowerCase();
      const originalEmail = String(payload.originalEmail ?? "").trim().toLowerCase();
      const name = String(payload.name ?? "").trim();
      const role = String(payload.role ?? "") as Role;
      const active = payload.active === false ? 0 : 1;
      const temporaryPassword = String(payload.tempPassword ?? "");
      const requestedApproval = String(payload.approvalStatus ?? "");
      const approvalStatus = ["pending", "approved", "suspended"].includes(requestedApproval) ? requestedApproval : active ? "approved" : "suspended";
      if (!(emailPattern(email) || isLocalIdentity(email)) || !name || !["admin", "user", "treasury"].includes(role)) return Response.json({ error: "Datos de usuario inválidos" }, { status: 400 });
      if (temporaryPassword && !validPassword(temporaryPassword)) return Response.json({ error:"La contraseña temporal debe tener al menos 8 caracteres, una minúscula, una mayúscula, un número y un símbolo especial" }, { status:400 });
      if ((originalEmail || email) === actor.email && (email !== actor.email || role !== "admin" || !active)) return Response.json({ error: "No puedes cambiar tu correo, rol o acceso de administrador" }, { status: 400 });
      if (originalEmail) {
        const existing = await env.DB.prepare("SELECT email, name, COALESCE(username, '') AS username, approval_status AS approvalStatus FROM members WHERE email = ?").bind(originalEmail).first<{email:string;name:string;username:string;approvalStatus:string}>();
        if (!existing) return Response.json({ error: "El usuario que deseas editar ya no existe" }, { status: 404 });
        if (isLocalIdentity(originalEmail) && email !== originalEmail) return Response.json({ error: "El identificador interno de una cuenta propia no puede cambiarse" }, { status: 400 });
        const duplicate = email !== originalEmail ? await env.DB.prepare("SELECT email FROM members WHERE email = ?").bind(email).first() : null;
        if (duplicate) return Response.json({ error: "Ese correo ya pertenece a otro usuario" }, { status: 400 });
        const approvingOwnAccount = Boolean(existing.username) && existing.approvalStatus === "pending" && approvalStatus === "approved" && active;
        const statements = [
          env.DB.prepare("UPDATE members SET email = ?, name = ?, role = ?, active = ?, approval_status = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?").bind(email, name, role, active, approvalStatus, originalEmail),
          env.DB.prepare("UPDATE squares SET reserved_by_email = ?, reserved_by_name = ? WHERE reserved_by_email = ? OR (reserved_by_email = '' AND reserved_by_name = ?)").bind(email, name, originalEmail, existing.name),
          env.DB.prepare("UPDATE squares SET paid_by_email = ?, paid_by_name = ? WHERE paid_by_email = ?").bind(email, name, originalEmail),
          activity(actor, null, "member_updated", "", "", `${name} · ${roleLabel(role)} · ${approvalStatus === "pending" ? "pendiente" : active ? "activo" : "suspendido"}`),
        ];
        if (approvingOwnAccount) {
          statements.push(env.DB.prepare("UPDATE squares SET reserved_by_email = ?, reserved_by_name = ? WHERE reserved_by_name = ?").bind(email, name, existing.name));
          statements.push(env.DB.prepare("UPDATE squares SET paid_by_email = ?, paid_by_name = ? WHERE paid_by_name = ?").bind(email, name, existing.name));
        }
        if (temporaryPassword) {
          const credentials = await hashPassword(temporaryPassword);
          statements.push(env.DB.prepare("UPDATE members SET password_salt = ?, password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = '', updated_at = CURRENT_TIMESTAMP WHERE email = ?").bind(credentials.salt, credentials.hash, originalEmail));
          statements.push(env.DB.prepare("DELETE FROM sessions WHERE member_email = ?").bind(originalEmail));
        }
        if (!active) statements.push(env.DB.prepare("DELETE FROM sessions WHERE member_email = ?").bind(originalEmail));
        await env.DB.batch(statements);
      } else {
        if (!emailPattern(email)) return Response.json({ error: "Para agregar un acceso anterior se requiere un correo válido; las cuentas propias se crean desde Solicitar acceso" }, { status: 400 });
        const duplicate = await env.DB.prepare("SELECT email FROM members WHERE email = ?").bind(email).first();
        if (duplicate) return Response.json({ error: "Ese correo ya está registrado; usa Editar" }, { status: 400 });
        await env.DB.batch([
          env.DB.prepare("INSERT INTO members (email, name, role, active, approval_status) VALUES (?, ?, ?, ?, ?)").bind(email, name, role, active, approvalStatus),
          activity(actor, null, "member_updated", "", "", `${name} · ${roleLabel(role)} · ${active ? "activo" : "suspendido"}`),
        ]);
      }
      const members = await env.DB.prepare(MEMBER_LIST_SQL).all();
      return Response.json({ members: members.results });
    }

    if (payload.action === "member_remove") {
      if (actor.role !== "admin") return forbidden();
      const email = String(payload.email ?? "").trim().toLowerCase();
      if (!(emailPattern(email) || isLocalIdentity(email))) return Response.json({ error: "Usuario inválido" }, { status: 400 });
      if (email === actor.email) return Response.json({ error: "No puedes retirar tu propio acceso de administrador" }, { status: 400 });
      const member = await env.DB.prepare("SELECT name FROM members WHERE email = ?").bind(email).first<{name:string}>();
      if (!member) return Response.json({ error: "El usuario ya no existe" }, { status: 404 });
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE member_email = ?").bind(email),
        env.DB.prepare("DELETE FROM members WHERE email = ?").bind(email),
        activity(actor, null, "member_removed", "", "", member.name),
      ]);
      const members = await env.DB.prepare(MEMBER_LIST_SQL).all();
      return Response.json({ members: members.results });
    }

    if (payload.action !== "square") return Response.json({ error: "Acción inválida" }, { status: 400 });
    const id = Number(payload.id);
    const requestedStatus = String(payload.status ?? "");
    if (!Number.isInteger(id) || id < 1 || id > 100 || !["available", "reserved", "paid"].includes(requestedStatus)) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    const current = await env.DB.prepare(`SELECT id, status, participant, contact, phone, reserved_by_email AS reservedByEmail, reserved_by_name AS reservedByName, reserved_at AS reservedAt, paid_by_email AS paidByEmail, paid_by_name AS paidByName, paid_at AS paidAt FROM squares WHERE id = ?`).bind(id).first<Record<string, string | number>>();
    if (!current) return Response.json({ error: "Casilla no encontrada" }, { status: 404 });
    const settings = await env.DB.prepare("SELECT visitor_digits AS visitorDigits, home_digits AS homeDigits FROM settings WHERE id = 1").first<{visitorDigits:string;homeDigits:string}>();
    const boardLocked = validDigits(String(settings?.visitorDigits ?? "")) && validDigits(String(settings?.homeDigits ?? ""));
    const owns = String(current.reservedByEmail ?? "").toLowerCase() === actor.email;
    const treasuryPayment = actor.role === "treasury" && current.status === "reserved" && requestedStatus === "paid" && (!owns || boardLocked);
    if (current.status === "paid" && requestedStatus === "reserved" && actor.role !== "admin") return forbidden("Sólo Administración puede regresar una casilla pagada a reservada");
    if (boardLocked && actor.role !== "admin" && !(actor.role === "treasury" && current.status === "reserved" && requestedStatus === "paid")) return forbidden("El tablero está cerrado; sólo Administración puede editar y Tesorería confirmar pagos");
    if (actor.role === "user" && current.status === "reserved" && requestedStatus === "paid") return forbidden("Solo Tesorería y Administración pueden confirmar pagos");
    if (!canChangeSquare(actor.role, String(current.status), requestedStatus, owns)) return forbidden("No puedes modificar una casilla vendida por otro socio");

    let participant = String(payload.participant ?? "").trim();
    let phone = String(payload.phone ?? "").trim();
    let reservedByEmail = String(current.reservedByEmail ?? "");
    let reservedByName = String(current.reservedByName ?? "");
    let reservedAt = String(current.reservedAt ?? "");
    let paidByEmail = String(current.paidByEmail ?? "");
    let paidByName = String(current.paidByName ?? "");
    let paidAt = String(current.paidAt ?? "");

    if (treasuryPayment) {
      participant = String(current.participant ?? "");
      phone = String(current.phone ?? "");
    }
    if (requestedStatus === "available") {
      participant = phone = reservedByEmail = reservedByName = reservedAt = paidByEmail = paidByName = paidAt = "";
    } else {
      if (!participant) return Response.json({ error: "El nombre de quien juega es obligatorio" }, { status: 400 });
      if (current.status === "available") {
        reservedByEmail = actor.email;
        reservedByName = actor.name;
        reservedAt = new Date().toISOString();
      }
      if (actor.role === "admin") {
        const requestedSellerName = String(payload.reservedByName ?? reservedByName).trim();
        if (!requestedSellerName) return Response.json({ error: "Selecciona al socio que vendió la casilla" }, { status: 400 });
        const registeredSeller = await env.DB.prepare("SELECT email, name FROM members WHERE name = ? AND active = 1 AND approval_status = 'approved' ORDER BY CASE WHEN COALESCE(username, '') <> '' THEN 0 ELSE 1 END LIMIT 1").bind(requestedSellerName).first<{email:string;name:string}>();
        const unchangedLegacySeller = current.status !== "available" && requestedSellerName === String(current.reservedByName ?? "") && !registeredSeller;
        if (!registeredSeller && !unchangedLegacySeller) return Response.json({ error: "Selecciona un socio activo registrado" }, { status: 400 });
        if (registeredSeller) { reservedByEmail = registeredSeller.email; reservedByName = registeredSeller.name; }
      }
      if (requestedStatus === "paid" && current.status !== "paid") {
        paidByEmail = actor.email;
        paidByName = actor.name;
        paidAt = new Date().toISOString();
      }
      if (requestedStatus === "reserved") paidByEmail = paidByName = paidAt = "";
    }

    const action = current.status === "available" && requestedStatus === "reserved" ? "reserved" : requestedStatus === "paid" && current.status !== "paid" ? "paid" : requestedStatus === "available" ? "released" : "updated";
    await env.DB.batch([
      env.DB.prepare(`UPDATE squares SET status = ?, participant = ?, contact = ?, phone = ?, reserved_by_email = ?, reserved_by_name = ?, reserved_at = ?, paid_by_email = ?, paid_by_name = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(requestedStatus, participant, reservedByName, phone, reservedByEmail, reservedByName, reservedAt, paidByEmail, paidByName, paidAt, id),
      activity(actor, id, action, String(current.status), requestedStatus, participant),
    ]);
    const square = await env.DB.prepare(`SELECT id, status, participant, contact, phone, reserved_by_email AS reservedByEmail, reserved_by_name AS reservedByName, reserved_at AS reservedAt, paid_by_email AS paidByEmail, paid_by_name AS paidByName, paid_at AS paidAt FROM squares WHERE id = ?`).bind(id).first();
    return Response.json({ square });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible guardar" }, { status: 500 });
  }
}

function activity(actor: Actor, squareId: number | null, actionName: string, previousStatus: string, newStatus: string, details: string) {
  return env.DB.prepare(`INSERT INTO activity (square_id, action, actor_email, actor_name, actor_role, previous_status, new_status, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(squareId, actionName, actor.email, actor.name, actor.role, previousStatus, newStatus, details);
}
function canChangeSquare(role: Role, current: string, requested: string, owns: boolean) {
  if (role === "admin") return true;
  if (current === "available") return requested === "reserved";
  if (owns && current === "reserved") return requested === "reserved" || (role === "treasury" && requested === "paid");
  if (owns && current === "paid") return requested === "paid";
  return role === "treasury" && current === "reserved" && requested === "paid";
}
function forbidden(message = "Tu nivel de acceso no permite este cambio") { return Response.json({ error: message, code: "FORBIDDEN" }, { status: 403 }); }
function sellerName(value: string) { const name = value.split(" · ")[0].trim(); return name === "JC Olivares" ? "Juan Carlos Olivares" : name === "Cabi Flores" ? "Cabiria Flores" : name; }
function validDigits(value: string) { return value.length === 10 && new Set(value).size === 10 && [...value].every((digit) => "0123456789".includes(digit)); }
function emailPattern(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function isLocalIdentity(value: string) { return /^local:[0-9a-f-]{36}$/.test(value); }
function roleLabel(role: Role) { return role === "admin" ? "Administrador" : role === "treasury" ? "Tesorería" : "Usuario"; }
function parseGames(value:string):Game[] { try { const parsed=JSON.parse(value); return Array.isArray(parsed)&&parsed.length ? parsed : DEFAULT_GAMES; } catch { return DEFAULT_GAMES; } }
function validateSeason(value:unknown):SeasonConfig|null {
  if (!value || typeof value !== "object") return null;
  const source=value as Record<string, unknown>, name=String(source.name??"").trim(), squarePrice=Number(source.squarePrice), gamePrize=Number(source.gamePrize), paymentDeadline=String(source.paymentDeadline??"").trim(), rawGames=source.games;
  if (name.length<2||name.length>24||!Number.isInteger(squarePrice)||squarePrice<1||squarePrice>100000||!Number.isInteger(gamePrize)||gamePrize<1||gamePrize>1000000||(paymentDeadline!==""&&!/^\d{4}-\d{2}-\d{2}$/.test(paymentDeadline))||!Array.isArray(rawGames)||rawGames.length<1||rawGames.length>25) return null;
  const games=rawGames.map((item)=>{const game=item as Record<string,unknown>;return{date:String(game?.date??"").trim(),visitor:String(game?.visitor??"").trim(),home:String(game?.home??"").trim()};});
  if (games.some((game)=>!game.date||!game.visitor||!game.home||game.date.length>30||game.visitor.length>80||game.home.length>80)) return null;
  return {name,squarePrice,gamePrize,paymentDeadline,games};
}
async function currentGameCount(){const row=await env.DB.prepare("SELECT games_json AS gamesJson FROM settings WHERE id = 1").first<{gamesJson:string}>();return parseGames(row?.gamesJson??"").length;}
