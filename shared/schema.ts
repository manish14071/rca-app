import { z } from 'zod';
import { pgTable, serial, text, timestamp, boolean, integer, PgColumn } from 'drizzle-orm/pg-core';

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique(),  // Remove .notNull()
  password: text("password"),  // Optional for Google auth users
  online: boolean("online").default(false).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  verificationToken: text("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry"),
  googleId: text("google_id").unique(),
  email: text("email").notNull().unique(),
  avatarUrl: text("avatar_url"),
  status: text("status"),
  statusEmoji: text("status_emoji"),
  lastSeen: timestamp("last_seen").defaultNow(),
  hasStory: boolean("has_story").default(false),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  mediaUrl: text("media_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deleted: boolean("deleted").default(false).notNull(),
});

// Create Zod schemas for validation
export const insertUserSchema = z.object({
  username: z.string().optional(), // Optional for Google users
  email: z.string().email(),
  password: z.string().min(6),
  googleId: z.string().optional(),
  emailVerified: z.boolean().optional(),
  verificationToken: z.string().optional(),
  verificationTokenExpiry: z.date().optional(),
});

export const insertMessageSchema = z.object({
  content: z.string(),
  senderId: z.number(),
  receiverId: z.number(),
  mediaUrl: z.string().nullable().optional(), // ✅ Allow null/undefined
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type User = typeof users.$inferSelect & {
  lastSeen?: Date | null;
  emailVerified: boolean;
  verificationToken?: string | null;
};
export type Message = typeof messages.$inferSelect;
