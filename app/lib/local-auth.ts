import { env } from "cloudflare:workers";

export type LocalRole = "admin" | "user" | "treasury";
export type LocalActor = { email: string; name: string; role: LocalRole; authProvider: "local" };

const SESSION_COOKIE = "quiniela_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 100_000;

export async function ensureLocalAuthSchema() {
  const db = env.DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS members (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    active INTEGER NOT NULL DEFAULT 1,
    username TEXT,
    password_salt TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    approval_status TEXT NOT NULL DEFAULT 'approved',
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();

  const info = await db.prepare("PRAGMA table_info(members)").all();
  const columns = new Set((info.results as Array<{ name: string }>).map((column) => column.name));
  const additions = [
    ["username", "ALTER TABLE members ADD COLUMN username TEXT"],
    ["password_salt", "ALTER TABLE members ADD COLUMN password_salt TEXT NOT NULL DEFAULT ''"],
    ["password_hash", "ALTER TABLE members ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''"],
    ["approval_status", "ALTER TABLE members ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'"],
    ["failed_attempts", "ALTER TABLE members ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0"],
    ["locked_until", "ALTER TABLE members ADD COLUMN locked_until TEXT NOT NULL DEFAULT ''"],
  ].filter(([name]) => !columns.has(name));
  if (additions.length) await db.batch(additions.map(([, sql]) => db.prepare(sql)));

  await db.batch([
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS members_username_unique ON members (username) WHERE username IS NOT NULL AND username <> ''"),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      member_email TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS sessions_member_idx ON sessions (member_email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at)"),
  ]);
}

export async function getLocalActor(request: Request): Promise<LocalActor | null> {
  await ensureLocalAuthSchema();
  const token = readCookie(request.headers.get("cookie") ?? "", SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const member = await env.DB.prepare(`SELECT m.email, m.name, m.role
    FROM sessions s JOIN members m ON m.email = s.member_email
    WHERE s.token_hash = ? AND s.expires_at > ? AND m.active = 1 AND m.approval_status = 'approved'`)
    .bind(tokenHash, now).first<{ email: string; name: string; role: LocalRole }>();
  if (!member) return null;
  return { ...member, authProvider: "local" };
}

export async function hashPassword(password: string, salt = randomValue(16)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(salt), iterations: PBKDF2_ITERATIONS }, key, 256);
  return { salt, hash: toBase64Url(new Uint8Array(bits)) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const calculated = await hashPassword(password, salt);
  const left = new TextEncoder().encode(calculated.hash);
  const right = new TextEncoder().encode(expectedHash);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function createSession(memberEmail: string) {
  const token = randomValue(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(new Date().toISOString()),
    env.DB.prepare("INSERT INTO sessions (token_hash, member_email, expires_at) VALUES (?, ?, ?)").bind(tokenHash, memberEmail, expiresAt),
  ]);
  return { token, cookie: `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}` };
}

export async function deleteSession(request: Request) {
  const token = readCookie(request.headers.get("cookie") ?? "", SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function normalizeUsername(value: string) { return value.trim().toLowerCase(); }
export function validUsername(value: string) { return /^[a-z0-9][a-z0-9._-]{3,29}$/.test(value); }

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}
function randomValue(length: number) { const bytes = new Uint8Array(length); crypto.getRandomValues(bytes); return toBase64Url(bytes); }
function readCookie(header: string, name: string) { return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? ""; }
function toBase64Url(bytes: Uint8Array) { let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function fromBase64Url(value: string) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="); const binary = atob(normalized); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
