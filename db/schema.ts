import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const squares = sqliteTable("squares", {
  id: integer("id").primaryKey(),
  status: text("status").notNull().default("available"),
  participant: text("participant").notNull().default(""),
  contact: text("contact").notNull().default(""),
  phone: text("phone").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  visitorDigits: text("visitor_digits").notNull().default(""),
  homeDigits: text("home_digits").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
