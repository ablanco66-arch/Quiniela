import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const squares = sqliteTable("squares", {
  id: integer("id").primaryKey(),
  status: text("status").notNull().default("available"),
  participant: text("participant").notNull().default(""),
  contact: text("contact").notNull().default(""),
  phone: text("phone").notNull().default(""),
  reservedByEmail: text("reserved_by_email").notNull().default(""),
  reservedByName: text("reserved_by_name").notNull().default(""),
  reservedAt: text("reserved_at").notNull().default(""),
  paidByEmail: text("paid_by_email").notNull().default(""),
  paidByName: text("paid_by_name").notNull().default(""),
  paidAt: text("paid_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  visitorDigits: text("visitor_digits").notNull().default(""),
  homeDigits: text("home_digits").notNull().default(""),
  seasonName: text("season_name").notNull().default("2026"),
  squarePrice: integer("square_price").notNull().default(100),
  gamePrize: integer("game_prize").notNull().default(300),
  paymentDeadline: text("payment_deadline").notNull().default("2026-09-14"),
  gamesJson: text("games_json").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const seasonArchives = sqliteTable("season_archives", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonName: text("season_name").notNull(),
  squarePrice: integer("square_price").notNull(),
  gamePrize: integer("game_prize").notNull(),
  paymentDeadline: text("payment_deadline").notNull().default(""),
  gamesJson: text("games_json").notNull(),
  squaresJson: text("squares_json").notNull(),
  resultsJson: text("results_json").notNull(),
  visitorDigits: text("visitor_digits").notNull().default(""),
  homeDigits: text("home_digits").notNull().default(""),
  archivedAt: text("archived_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("season_archives_archived_at_idx").on(table.archivedAt)]);

export const members = sqliteTable("members", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"),
  active: integer("active").notNull().default(1),
  username: text("username").unique(),
  passwordSalt: text("password_salt").notNull().default(""),
  passwordHash: text("password_hash").notNull().default(""),
  approvalStatus: text("approval_status").notNull().default("approved"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until").notNull().default(""),
  mustChangePassword: integer("must_change_password").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  memberEmail: text("member_email").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("sessions_member_idx").on(table.memberEmail), index("sessions_expires_idx").on(table.expiresAt)]);

export const activity = sqliteTable("activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  squareId: integer("square_id"),
  action: text("action").notNull(),
  actorEmail: text("actor_email").notNull(),
  actorName: text("actor_name").notNull(),
  actorRole: text("actor_role").notNull(),
  previousStatus: text("previous_status").notNull().default(""),
  newStatus: text("new_status").notNull().default(""),
  details: text("details").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("activity_created_at_idx").on(table.createdAt)]);

export const gameResults = sqliteTable("game_results", {
  gameId: integer("game_id").primaryKey(),
  visitorScore: integer("visitor_score").notNull(),
  homeScore: integer("home_score").notNull(),
  updatedByEmail: text("updated_by_email").notNull().default(""),
  updatedByName: text("updated_by_name").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
