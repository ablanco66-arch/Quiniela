import { env } from "cloudflare:workers";
import { createSession, deleteSession, ensureLocalAuthSchema, getLocalActor, hashPassword, normalizeUsername, validUsername, verifyPassword } from "../../lib/local-auth";

type LoginMember = {
  email: string; name: string; role: string; active: number; username: string;
  passwordSalt: string; passwordHash: string; approvalStatus: string;
  failedAttempts: number; lockedUntil: string; mustChangePassword: number;
};

export async function POST(request: Request) {
  try {
    await ensureLocalAuthSchema();
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    if (action === "register") return register(payload);
    if (action === "login") return login(payload);
    if (action === "change_password") return changePassword(request, payload);
    if (action === "logout") {
      const cookie = await deleteSession(request);
      return json({ ok: true }, 200, cookie);
    }
    return json({ error: "Acción inválida" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No fue posible procesar el acceso" }, 500);
  }
}

async function register(payload: Record<string, unknown>) {
  const name = String(payload.name ?? "").trim();
  const username = normalizeUsername(String(payload.username ?? ""));
  const password = String(payload.password ?? "");
  if (name.length < 3 || name.length > 80) return json({ error: "Escribe tu nombre completo" }, 400);
  if (!validUsername(username)) return json({ error: "El usuario debe tener de 4 a 30 caracteres: letras, números, punto, guion o guion bajo" }, 400);
  if (password.length < 8 || password.length > 128) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
  const duplicate = await env.DB.prepare("SELECT email, approval_status AS approvalStatus FROM members WHERE username = ?").bind(username).first<{email:string;approvalStatus:string}>();
  if (duplicate?.approvalStatus === "pending") return json({ ok: true, message: "Tu solicitud ya está registrada y continúa pendiente de aprobación." });
  if (duplicate) return json({ error: "Ese nombre de usuario ya está registrado" }, 409);
  const credentials = await hashPassword(password);
  const email = `local:${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO members (email, name, role, active, username, password_salt, password_hash, approval_status)
    VALUES (?, ?, 'user', 0, ?, ?, ?, 'pending')`).bind(email, name, username, credentials.salt, credentials.hash).run();
  return json({ ok: true, message: "Solicitud enviada. Un administrador debe aprobarla antes de que puedas entrar." }, 201);
}

async function login(payload: Record<string, unknown>) {
  const username = normalizeUsername(String(payload.username ?? ""));
  const password = String(payload.password ?? "");
  const member = await env.DB.prepare(`SELECT email, name, role, active, username,
    password_salt AS passwordSalt, password_hash AS passwordHash,
    approval_status AS approvalStatus, failed_attempts AS failedAttempts, locked_until AS lockedUntil
    , must_change_password AS mustChangePassword
    FROM members WHERE username = ?`).bind(username).first<LoginMember>();
  if (!member?.passwordHash || !member.passwordSalt) return json({ error: "Usuario o contraseña incorrectos" }, 401);
  const now = Date.now();
  if (member.lockedUntil && Date.parse(member.lockedUntil) > now) return json({ error: "Acceso bloqueado temporalmente. Intenta nuevamente en 15 minutos." }, 429);
  const valid = await verifyPassword(password, member.passwordSalt, member.passwordHash);
  if (!valid) {
    const attempts = Number(member.failedAttempts ?? 0) + 1;
    const lockedUntil = attempts >= 5 ? new Date(now + 15 * 60 * 1000).toISOString() : "";
    await env.DB.prepare("UPDATE members SET failed_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?").bind(attempts >= 5 ? 0 : attempts, lockedUntil, member.email).run();
    return json({ error: attempts >= 5 ? "Demasiados intentos. El acceso quedó bloqueado por 15 minutos." : "Usuario o contraseña incorrectos" }, attempts >= 5 ? 429 : 401);
  }
  if (member.approvalStatus === "pending") return json({ error: "Tu solicitud todavía está pendiente de aprobación por un administrador", code: "PENDING_APPROVAL" }, 403);
  if (!member.active || member.approvalStatus !== "approved") return json({ error: "Tu acceso está suspendido. Comunícate con un administrador." }, 403);
  await env.DB.prepare("UPDATE members SET failed_attempts = 0, locked_until = '', updated_at = CURRENT_TIMESTAMP WHERE email = ?").bind(member.email).run();
  const session = await createSession(member.email);
  return json({ ok: true, name: member.name, role: member.role, mustChangePassword:Boolean(member.mustChangePassword) }, 200, session.cookie);
}

async function changePassword(request: Request, payload: Record<string, unknown>) {
  const actor = await getLocalActor(request);
  if (!actor) return json({ error: "Tu sesión venció. Inicia nuevamente con la contraseña temporal." }, 401);
  const password = String(payload.password ?? "");
  if (password.length < 8 || password.length > 128) return json({ error: "La nueva contraseña debe tener al menos 8 caracteres" }, 400);
  const credentials = await hashPassword(password);
  await env.DB.prepare("UPDATE members SET password_salt = ?, password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = '', updated_at = CURRENT_TIMESTAMP WHERE email = ?")
    .bind(credentials.salt, credentials.hash, actor.email).run();
  return json({ ok: true, message: "Contraseña actualizada" });
}

function json(body: Record<string, unknown>, status = 200, cookie = "") {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}
