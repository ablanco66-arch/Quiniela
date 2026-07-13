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
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const members = sqliteTable("members", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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
