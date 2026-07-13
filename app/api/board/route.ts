import { env } from "cloudflare:workers";

type SeedSquare = { id: number; status: "reserved" | "paid"; participant: string; contact: string };

const occupied: SeedSquare[] = [
  [4,"reserved","Cabiria Flores","Cabi Flores"],[5,"reserved","Eduardo Cinco","Yamel Guillén"],[6,"reserved","Jaime Chávez","Mario Blanco"],[7,"reserved","Jay Marcel","Gabriel Barbosa"],[9,"reserved","María Xóchitl Sánchez","María Xóchitl Sánchez"],[11,"reserved","Rubén de Santiago","Yamel Guillén"],[13,"reserved","Omar Apodaca","Yamel Guillén"],[16,"reserved","Daniel de la Rosa","Angie de la Rosa"],[17,"reserved","Rosa Ávila","Angie de la Rosa"],[18,"paid","José Calderón","Darío Sánchez"],[21,"reserved","Roberto Martínez","Angie de la Rosa"],[22,"paid","Rosa Ma. Espinoza","Mario Blanco"],[24,"reserved","Manolo Papadakis","Mario Blanco"],[25,"reserved","Efrén Páramo","Myrna Sandoval"],[26,"reserved","Irma de Alvarado","Mario Blanco · CR Cd. Juárez"],[29,"reserved","Juan Carlos Márquez","Darío Sánchez"],[30,"reserved","Roberto de la Rosa","Angie de la Rosa"],[33,"reserved","Felipe Meza","Mario Blanco · CRJ Ejecutivo"],[34,"reserved","Javo Murguía","Mario Blanco"],[35,"reserved","Javier Guillén","Yamel Guillén"],[37,"reserved","Edith Manríquez","Edith Manríquez"],[40,"paid","Alejandro Arrieta","Darío Sánchez"],[43,"reserved","Juan Carlos Olivares","JC Olivares"],[44,"reserved","Nidia de la Rosa","Angie de la Rosa"],[45,"reserved","Jesús Cansino","Yamel Guillén"],[47,"reserved","Charly Coutiño","Myrna Sandoval"],[48,"paid","Rosa Ma. Espinoza","Glafira Manríquez"],[50,"reserved","Marty Class","Edith Manríquez"],[54,"reserved","Enrique Luján","Mario Blanco"],[55,"reserved","Richy Cabada","Angie de la Rosa"],[57,"reserved","Cindy Holguín","Darío Sánchez"],[58,"reserved","Daniel Martínez","Mario Blanco · CRJ Siglo XXI"],[64,"reserved","Guillermo Huerta","Glafira Manríquez · CRJ S. XXI"],[65,"reserved","Laura de la Rosa","Angie de la Rosa"],[66,"reserved","Felipe Meza","Mario Blanco · CRJ Ejecutivo"],[67,"reserved","Jay Marcel","Gabriel Barbosa"],[72,"reserved","Jimmy Holguín","Mario Blanco · CR Cd. Juárez"],[76,"paid","Andrés Blanco","Glafira Manríquez"],[85,"paid","Teófilo Ugalde","Mario Blanco"],[90,"reserved","David Jiménez","Angie de la Rosa"],[96,"paid","Adriana Galván","Edith Manríquez"],[98,"paid","Andrés Blanco","Mario Blanco"],[99,"reserved","Andrés Iglesias","Mario Blanco"],[100,"reserved","Betzabel Tobías","Betzabel Tobías"],
].map(([id,status,participant,contact]) => ({ id: id as number, status: status as "reserved"|"paid", participant: participant as string, contact: contact as string }));

async function ensureDatabase() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS squares (id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'available', participant TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), visitor_digits TEXT NOT NULL DEFAULT '', home_digits TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  ]);
  const count = await db.prepare("SELECT COUNT(*) AS total FROM squares").first<{ total: number }>();
  if (!count?.total) {
    const byId = new Map(occupied.map((square) => [square.id, square]));
    await db.batch(Array.from({ length: 100 }, (_, index) => {
      const id = index + 1;
      const square = byId.get(id);
      return db.prepare("INSERT INTO squares (id, status, participant, contact, phone) VALUES (?, ?, ?, ?, '')").bind(id, square?.status ?? "available", square?.participant ?? "", square?.contact ?? "");
    }));
  }
  await db.prepare("INSERT OR IGNORE INTO settings (id, visitor_digits, home_digits) VALUES (1, '', '')").run();
}

export async function GET() {
  try {
    await ensureDatabase();
    const [squareResult, settings] = await Promise.all([
      env.DB.prepare("SELECT id, status, participant, contact, phone FROM squares ORDER BY id").all(),
      env.DB.prepare("SELECT visitor_digits AS visitorDigits, home_digits AS homeDigits FROM settings WHERE id = 1").first(),
    ]);
    return Response.json({ squares: squareResult.results, settings });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar el tablero" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDatabase();
    const payload = await request.json() as Record<string, unknown>;
    if (payload.action === "digits") {
      const visitorDigits = String(payload.visitorDigits ?? "");
      const homeDigits = String(payload.homeDigits ?? "");
      if (![visitorDigits, homeDigits].every((value) => value === "" || validDigits(value))) return Response.json({ error: "Dígitos inválidos" }, { status: 400 });
      await env.DB.prepare("UPDATE settings SET visitor_digits = ?, home_digits = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1").bind(visitorDigits, homeDigits).run();
      return Response.json({ settings: { visitorDigits, homeDigits } });
    }
    const id = Number(payload.id);
    const status = String(payload.status ?? "");
    const participant = status === "available" ? "" : String(payload.participant ?? "").trim();
    const contact = status === "available" ? "" : String(payload.contact ?? "").trim();
    const phone = status === "available" ? "" : String(payload.phone ?? "").trim();
    if (!Number.isInteger(id) || id < 1 || id > 100 || !["available","reserved","paid"].includes(status) || (status !== "available" && !participant)) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    await env.DB.prepare("UPDATE squares SET status = ?, participant = ?, contact = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, participant, contact, phone, id).run();
    const square = await env.DB.prepare("SELECT id, status, participant, contact, phone FROM squares WHERE id = ?").bind(id).first();
    return Response.json({ square });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible guardar" }, { status: 500 });
  }
}

function validDigits(value: string) { return value.length === 10 && new Set(value).size === 10 && [...value].every((digit) => "0123456789".includes(digit)); }
