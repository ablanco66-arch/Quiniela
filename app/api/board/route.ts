import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

type Role = "admin" | "user" | "treasury";
type SeedSquare = { id: number; status: "reserved" | "paid"; participant: string; contact: string };
type Actor = { email: string; name: string; role: Role };

const occupied: SeedSquare[] = [
  [4,"reserved","Cabiria Flores","Cabi Flores"],[5,"reserved","Eduardo Cinco","Yamel Guillén"],[6,"reserved","Jaime Chávez","Mario Blanco"],[7,"reserved","Jay Marcel","Gabriel Barbosa"],[9,"reserved","María Xóchitl Sánchez","María Xóchitl Sánchez"],[11,"reserved","Rubén de Santiago","Yamel Guillén"],[13,"reserved","Omar Apodaca","Yamel Guillén"],[16,"reserved","Daniel de la Rosa","Angie de la Rosa"],[17,"reserved","Rosa Ávila","Angie de la Rosa"],[18,"paid","José Calderón","Darío Sánchez"],[21,"reserved","Roberto Martínez","Angie de la Rosa"],[22,"paid","Rosa Ma. Espinoza","Mario Blanco"],[24,"reserved","Manolo Papadakis","Mario Blanco"],[25,"reserved","Efrén Páramo","Myrna Sandoval"],[26,"reserved","Irma de Alvarado","Mario Blanco · CR Cd. Juárez"],[29,"reserved","Juan Carlos Márquez","Darío Sánchez"],[30,"reserved","Roberto de la Rosa","Angie de la Rosa"],[33,"reserved","Felipe Meza","Mario Blanco · CRJ Ejecutivo"],[34,"reserved","Javo Murguía","Mario Blanco"],[35,"reserved","Javier Guillén","Yamel Guillén"],[37,"reserved","Edith Manríquez","Edith Manríquez"],[40,"paid","Alejandro Arrieta","Darío Sánchez"],[43,"reserved","Juan Carlos Olivares","JC Olivares"],[44,"reserved","Nidia de la Rosa","Angie de la Rosa"],[45,"reserved","Jesús Cansino","Yamel Guillén"],[47,"reserved","Charly Coutiño","Myrna Sandoval"],[48,"paid","Rosa Ma. Espinoza","Glafira Manríquez"],[50,"reserved","Marty Class","Edith Manríquez"],[54,"reserved","Enrique Luján","Mario Blanco"],[55,"reserved","Richy Cabada","Angie de la Rosa"],[57,"reserved","Cindy Holguín","Darío Sánchez"],[58,"reserved","Daniel Martínez","Mario Blanco · CRJ Siglo XXI"],[64,"reserved","Guillermo Huerta","Glafira Manríquez · CRJ S. XXI"],[65,"reserved","Laura de la Rosa","Angie de la Rosa"],[66,"reserved","Felipe Meza","Mario Blanco · CRJ Ejecutivo"],[67,"reserved","Jay Marcel","Gabriel Barbosa"],[72,"reserved","Jimmy Holguín","Mario Blanco · CR Cd. Juárez"],[76,"paid","Andrés Blanco","Glafira Manríquez"],[85,"paid","Teófilo Ugalde","Mario Blanco"],[90,"reserved","David Jiménez","Angie de la Rosa"],[96,"paid","Adriana Galván","Edith Manríquez"],[98,"paid","Andrés Blanco","Mario Blanco"],[99,"reserved","Andrés Iglesias","Mario Blanco"],[100,"reserved","Betzabel Tobías","Betzabel Tobías"],
].map(([id,status,participant,contact]) => ({ id: id as number, status: status as "reserved"|"paid", participant: participant as string, contact: contact as string }));

async function ensureDatabase() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS squares (id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'available', participant TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', reserved_by_email TEXT NOT NULL DEFAULT '', reserved_by_name TEXT NOT NULL DEFAULT '', reserved_at TEXT NOT NULL DEFAULT '', paid_by_email TEXT NOT NULL DEFAULT '', paid_by_name TEXT NOT NULL DEFAULT '', paid_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), visitor_digits TEXT NOT NULL DEFAULT '', home_digits TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS members (email TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, square_id INTEGER, action TEXT NOT NULL, actor_email TEXT NOT NULL, actor_name TEXT NOT NULL, actor_role TEXT NOT NULL, previous_status TEXT NOT NULL DEFAULT '', new_status TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS activity_created_at_idx ON activity (created_at DESC)`),
  ]);

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
    db.prepare(`UPDATE squares SET reserved_by_name = CASE WHEN instr(contact, ' · ') > 0 THEN trim(substr(contact, 1, instr(contact, ' · ') - 1)) ELSE trim(contact) END, reserved_at = CASE WHEN reserved_at = '' THEN updated_at ELSE reserved_at END WHERE status <> 'available' AND reserved_by_name = ''`),
    db.prepare(`UPDATE squares SET reserved_by_name = CASE reserved_by_name WHEN 'JC Olivares' THEN 'Juan Carlos Olivares' WHEN 'Cabi Flores' THEN 'Cabiria Flores' ELSE reserved_by_name END WHERE reserved_by_name IN ('JC Olivares', 'Cabi Flores')`),
    db.prepare(`UPDATE squares SET paid_by_name = 'Registro inicial', paid_at = CASE WHEN paid_at = '' THEN updated_at ELSE paid_at END WHERE status = 'paid' AND paid_by_name = ''`),
  ]);
}

async function getActor(): Promise<Actor | Response> {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Inicia sesión para continuar", code: "AUTH_REQUIRED" }, { status: 401 });
  await ensureDatabase();
  const email = user.email.trim().toLowerCase();
  const total = await env.DB.prepare("SELECT COUNT(*) AS total FROM members WHERE active = 1").first<{ total: number }>();
  if (!total?.total) {
    await env.DB.prepare("INSERT OR IGNORE INTO members (email, name, role, active) VALUES (?, ?, 'admin', 1)").bind(email, user.displayName).run();
  }
  const member = await env.DB.prepare("SELECT email, name, role, active FROM members WHERE email = ?").bind(email).first<{ email: string; name: string; role: Role; active: number }>();
  if (!member?.active) return Response.json({ error: "Tu cuenta no está autorizada para esta quiniela", code: "ACCESS_DENIED", email }, { status: 403 });
  return { email: member.email, name: member.name || user.displayName, role: member.role };
}

export async function GET() {
  try {
    const actor = await getActor();
    if (actor instanceof Response) return actor;
    const [squareResult, settings, memberResult, activityResult] = await Promise.all([
      env.DB.prepare(`SELECT id, status, participant, contact, phone, reserved_by_email AS reservedByEmail, reserved_by_name AS reservedByName, reserved_at AS reservedAt, paid_by_email AS paidByEmail, paid_by_name AS paidByName, paid_at AS paidAt FROM squares ORDER BY id`).all(),
      env.DB.prepare("SELECT visitor_digits AS visitorDigits, home_digits AS homeDigits FROM settings WHERE id = 1").first(),
      actor.role === "admin" ? env.DB.prepare("SELECT email, name, role, active FROM members ORDER BY name, email").all() : Promise.resolve({ results: [] }),
      env.DB.prepare("SELECT id, square_id AS squareId, action, actor_name AS actorName, actor_role AS actorRole, previous_status AS previousStatus, new_status AS newStatus, details, created_at AS createdAt FROM activity ORDER BY id DESC LIMIT 60").all(),
    ]);
    return Response.json({ squares: squareResult.results, settings, me: actor, members: memberResult.results, activity: activityResult.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar el tablero" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await getActor();
    if (actor instanceof Response) return actor;
    const payload = await request.json() as Record<string, unknown>;

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

    if (payload.action === "member") {
      if (actor.role !== "admin") return forbidden();
      const email = String(payload.email ?? "").trim().toLowerCase();
      const name = String(payload.name ?? "").trim();
      const role = String(payload.role ?? "") as Role;
      const active = payload.active === false ? 0 : 1;
      if (!emailPattern(email) || !name || !["admin", "user", "treasury"].includes(role)) return Response.json({ error: "Datos de usuario inválidos" }, { status: 400 });
      if (email === actor.email && (role !== "admin" || !active)) return Response.json({ error: "No puedes retirar tu propio acceso de administrador" }, { status: 400 });
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO members (email, name, role, active) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, active = excluded.active, updated_at = CURRENT_TIMESTAMP`).bind(email, name, role, active),
        activity(actor, null, "member_updated", "", "", `${name} · ${roleLabel(role)} · ${active ? "activo" : "inactivo"}`),
      ]);
      const members = await env.DB.prepare("SELECT email, name, role, active FROM members ORDER BY name, email").all();
      return Response.json({ members: members.results });
    }

    if (payload.action !== "square") return Response.json({ error: "Acción inválida" }, { status: 400 });
    const id = Number(payload.id);
    const requestedStatus = String(payload.status ?? "");
    if (!Number.isInteger(id) || id < 1 || id > 100 || !["available", "reserved", "paid"].includes(requestedStatus)) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    const current = await env.DB.prepare(`SELECT id, status, participant, contact, phone, reserved_by_email AS reservedByEmail, reserved_by_name AS reservedByName, reserved_at AS reservedAt, paid_by_email AS paidByEmail, paid_by_name AS paidByName, paid_at AS paidAt FROM squares WHERE id = ?`).bind(id).first<Record<string, string | number>>();
    if (!current) return Response.json({ error: "Casilla no encontrada" }, { status: 404 });
    const owns = String(current.reservedByEmail ?? "").toLowerCase() === actor.email;
    const treasuryPayment = actor.role === "treasury" && current.status === "reserved" && requestedStatus === "paid" && !owns;
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
        reservedByEmail = String(payload.reservedByEmail ?? reservedByEmail).trim().toLowerCase();
        reservedByName = String(payload.reservedByName ?? (reservedByName || actor.name)).trim();
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
  if (owns && current === "reserved") return requested === "reserved" || requested === "paid";
  if (owns && current === "paid") return requested === "paid";
  return role === "treasury" && current === "reserved" && requested === "paid";
}
function forbidden(message = "Tu nivel de acceso no permite este cambio") { return Response.json({ error: message, code: "FORBIDDEN" }, { status: 403 }); }
function sellerName(value: string) { const name = value.split(" · ")[0].trim(); return name === "JC Olivares" ? "Juan Carlos Olivares" : name === "Cabi Flores" ? "Cabiria Flores" : name; }
function validDigits(value: string) { return value.length === 10 && new Set(value).size === 10 && [...value].every((digit) => "0123456789".includes(digit)); }
function emailPattern(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function roleLabel(role: Role) { return role === "admin" ? "Administrador" : role === "treasury" ? "Tesorería" : "Usuario"; }
