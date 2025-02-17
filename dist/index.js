// server/index.ts
import express3 from "express";

// server/routes.ts
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

// server/db-storage.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// shared/schema.ts
import { z } from "zod";
import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique(),
  // Remove .notNull()
  password: text("password"),
  // Optional for Google auth users
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
  hasStory: boolean("has_story").default(false)
});
var messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  mediaUrl: text("media_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deleted: boolean("deleted").default(false).notNull()
});
var insertUserSchema = z.object({
  username: z.string().optional(),
  // Optional for Google users
  email: z.string().email(),
  password: z.string().min(6),
  googleId: z.string().optional(),
  emailVerified: z.boolean().optional(),
  verificationToken: z.string().optional(),
  verificationTokenExpiry: z.date().optional()
});
var insertMessageSchema = z.object({
  content: z.string(),
  senderId: z.number(),
  receiverId: z.number(),
  mediaUrl: z.string().nullable().optional()
  // ✅ Allow null/undefined
});

// server/db-storage.ts
import { eq, or, and, desc, ne, asc, gt } from "drizzle-orm";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
console.log("Environment loaded from:", path.resolve(__dirname, "../.env"));
console.log("DATABASE_URL:", process.env.DATABASE_URL?.substring(0, 20) + "...");
var DbStorage = class {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not defined");
    }
    const client = postgres(connectionString);
    this.db = drizzle(client);
  }
  async getAllUsers(exceptUserId) {
    return await this.db.select().from(users).where(ne(users.id, exceptUserId));
  }
  async getUser(id) {
    const results = await this.db.select().from(users).where(eq(users.id, id));
    return results[0];
  }
  async getUserByUsername(username) {
    const results = await this.db.select().from(users).where(eq(users.username, username));
    return results[0];
  }
  async getUserByEmail(email) {
    const results = await this.db.select().from(users).where(eq(users.email, email));
    return results[0];
  }
  async createUser(userData) {
    const finalData = {
      ...userData,
      username: userData.username || userData.email
    };
    const result = await this.db.insert(users).values(finalData).returning();
    return result[0];
  }
  async clearVerificationToken(userId) {
    await this.db.update(users).set({
      verificationToken: null,
      verificationTokenExpiry: null
    }).where(eq(users.id, userId));
  }
  async setUserOnline(id, online) {
    await this.db.update(users).set({ online }).where(eq(users.id, id));
  }
  // Message operations
  async createMessage(messageData) {
    console.log("Creating message in DB:", messageData);
    if (messageData.senderId === messageData.receiverId) {
      throw new Error("Cannot send message to yourself");
    }
    const result = await this.db.insert(messages).values({
      ...messageData,
      createdAt: /* @__PURE__ */ new Date(),
      deleted: false,
      mediaUrl: messageData.mediaUrl || null
    }).returning();
    console.log("DB returned message:", result[0]);
    return result[0];
  }
  async getMessage(id) {
    const results = await this.db.select().from(messages).where(eq(messages.id, id));
    return results[0];
  }
  async getMessagesBetweenUsers(user1Id, user2Id) {
    return await this.db.select().from(messages).where(
      or(
        and(
          eq(messages.senderId, user1Id),
          eq(messages.receiverId, user2Id)
        ),
        and(
          eq(messages.senderId, user2Id),
          eq(messages.receiverId, user1Id)
        )
      )
    ).orderBy(asc(messages.createdAt));
  }
  async deleteMessage(id) {
    await this.db.update(messages).set({ deleted: true }).where(eq(messages.id, id));
  }
  async editMessage(id, content) {
    await this.db.update(messages).set({ content }).where(eq(messages.id, id));
  }
  async getUserChats(userId) {
    const userMessages = await this.db.select().from(messages).where(
      or(
        eq(messages.senderId, userId),
        eq(messages.receiverId, userId)
      )
    ).orderBy(desc(messages.createdAt));
    const chatMap = /* @__PURE__ */ new Map();
    userMessages.forEach((msg) => {
      const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!chatMap.has(otherUserId)) {
        chatMap.set(otherUserId, { userId: otherUserId, lastMessage: msg });
      }
    });
    return Array.from(chatMap.values());
  }
  async getAllUserData() {
    return await this.db.select().from(users);
  }
  async getVerificationToken(token) {
    return this.db.select().from(users).where(
      and(
        eq(users.verificationToken, token),
        gt(users.verificationTokenExpiry, /* @__PURE__ */ new Date())
      )
    ).limit(1).then((res) => res[0]);
  }
  async verifyUserEmail(id) {
    await this.db.update(users).set({
      emailVerified: true,
      verificationToken: null,
      verificationTokenExpiry: null
    }).where(eq(users.id, id));
  }
  async updateVerificationToken(id, token, expiry) {
    await this.db.update(users).set({
      verificationToken: token,
      verificationTokenExpiry: expiry
    }).where(eq(users.id, id));
  }
  async updateUserProfile(userId, profileData) {
    await this.db.update(users).set(profileData).where(eq(users.id, userId));
  }
  async updateUserPresence(userId, lastSeen) {
    await this.db.update(users).set({ lastSeen }).where(eq(users.id, userId));
  }
};

// server/storage.ts
var storage = new DbStorage();

// server/routes.ts
import { z as z2 } from "zod";
import { randomBytes } from "crypto";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import path2 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import express from "express";
import { OAuth2Client } from "google-auth-library";

// server/email-service.ts
import nodemailer from "nodemailer";
var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});
transporter.verify((error) => {
  if (error) console.error("SMTP Connection Error:", error);
  else console.log("SMTP Server Ready");
});
async function sendVerificationEmail(email, token) {
  const verificationUrl = `${process.env.APP_URL}/verify-email?token=${token}`;
  await transporter.sendMail({
    from: "Your App <noreply@yourapp.com>",
    to: email,
    subject: "Verify Your Email Address",
    html: `
      <p>Click below to verify your email:</p>
      <a href="${verificationUrl}">Verify Email</a>
      <p>This link expires in 1 hour.</p>
    `
  });
}

// server/routes.ts
function registerRoutes(app2) {
  const httpServer = createServer(app2);
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    clientTracking: true
  });
  console.log("[WebSocket] Server initialized on path: /ws");
  const clients = /* @__PURE__ */ new Map();
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log("[WebSocket] Client timed out, terminating connection");
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 3e4);
  wss.on("close", () => {
    clearInterval(pingInterval);
  });
  wss.on("connection", (ws, req) => {
    console.log("[WebSocket] New connection from:", req.socket.remoteAddress);
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log("[WebSocket] Received message:", message);
        switch (message.type) {
          case "auth":
            ws.userId = message.payload.userId;
            if (ws.userId) {
              const existingConnection = clients.get(ws.userId);
              if (existingConnection) {
                console.log("[WebSocket] Closing existing connection for user:", ws.userId);
                existingConnection.close();
              }
              clients.set(ws.userId, ws);
              await storage.setUserOnline(ws.userId, true);
              broadcastUserStatus(ws.userId, true);
              console.log(`[WebSocket] User ${ws.userId} authenticated. Active clients:`, Array.from(clients.keys()));
            }
            break;
          case "typing":
            if (ws.userId) {
              const receiverWs = clients.get(message.payload.receiverId);
              if (receiverWs?.readyState === WebSocket.OPEN) {
                receiverWs.send(JSON.stringify({
                  type: "typing",
                  payload: { userId: ws.userId }
                }));
                console.log(`[WebSocket] Typing indicator sent from ${ws.userId} to ${message.payload.receiverId}`);
              } else {
                console.log(`[WebSocket] Cannot send typing indicator: receiver ${message.payload.receiverId} not connected`);
              }
            }
            break;
        }
      } catch (err) {
        console.error("[WebSocket] Message error:", err);
        ws.send(JSON.stringify({
          type: "error",
          payload: { message: "Failed to process message" }
        }));
      }
    });
    ws.on("error", (error) => {
      console.error("[WebSocket] Error:", error);
    });
    ws.on("close", async () => {
      if (ws.userId) {
        console.log(`[WebSocket] User ${ws.userId} disconnected`);
        clients.delete(ws.userId);
        await storage.setUserOnline(ws.userId, false);
        broadcastUserStatus(ws.userId, false);
      }
    });
  });
  function broadcastUserStatus(userId, online) {
    const message = JSON.stringify({
      type: "userStatus",
      payload: { userId, online }
    });
    console.log(`[WebSocket] Broadcasting user status: ${userId} is ${online ? "online" : "offline"}`);
    Array.from(clients.values()).forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
  app2.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password } = req.body;
      const userData = {
        username: email,
        email,
        password,
        emailVerified: false,
        verificationToken: randomBytes(32).toString("hex"),
        verificationTokenExpiry: new Date(Date.now() + 36e5)
      };
      const validatedData = insertUserSchema.parse(userData);
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already exists" });
      }
      const user = await storage.createUser(validatedData);
      await sendVerificationEmail(email, userData.verificationToken);
      res.json({ message: "Check your email for verification instructions" });
    } catch (err) {
      if (err instanceof z2.ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          details: err.errors
        });
      }
      console.error("Registration error:", err);
      res.status(400).json({ error: "Invalid registration data" });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await storage.getUserByEmail(email);
      if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      if (!user.emailVerified) {
        return res.status(403).json({
          error: "Email not verified",
          needsVerification: true
        });
      }
      res.json({ id: user.id, email: user.email });
    } catch (err) {
      res.status(400).json({ error: "Invalid login data" });
    }
  });
  app2.post("/api/auth/google", async (req, res) => {
    try {
      const { credential } = req.body;
      if (!credential) {
        return res.status(400).json({ error: "Google credential is required" });
      }
      const user = await verifyGoogleToken(credential);
      console.log("Google authentication successful:", { id: user.id, username: user.username });
      res.json({ id: user.id, username: user.username });
    } catch (error) {
      console.error("Google authentication error:", error);
      res.status(401).json({ error: "Google authentication failed" });
    }
  });
  app2.post("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.body;
      const user = await storage.getVerificationToken(token);
      if (!user) {
        console.log("Invalid verification token:", token);
        return res.status(400).json({ error: "Invalid or expired token" });
      }
      if (user.verificationTokenExpiry && /* @__PURE__ */ new Date() > new Date(user.verificationTokenExpiry)) {
        console.log("Token expired for user:", user.id);
        return res.status(400).json({ error: "Verification token has expired" });
      }
      try {
        await storage.verifyUserEmail(user.id);
        console.log("Successfully verified email for user:", user.id);
        await storage.clearVerificationToken(user.id);
        res.json({ success: true });
      } catch (updateError) {
        console.error("Failed to update user verification status:", updateError);
        res.status(500).json({ error: "Failed to verify email" });
      }
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  });
  app2.post("/api/messages", async (req, res) => {
    try {
      console.log("Raw message data:", req.body);
      const messageData = insertMessageSchema.parse({ ...req.body, mediaUrl: req.body.mediaUrl || null });
      if (!messageData.content?.trim() && !messageData.mediaUrl) {
        return res.status(400).json({ error: "Message content or media required" });
      }
      console.log("Parsed message data:", messageData);
      if (messageData.senderId === messageData.receiverId) {
        console.error("Invalid message: sender and receiver are the same:", messageData);
        return res.status(400).json({ error: "Cannot send message to yourself" });
      }
      const message = await storage.createMessage(messageData);
      console.log("Created message:", message);
      const receiverWs = clients.get(message.receiverId);
      if (receiverWs?.readyState === WebSocket.OPEN) {
        console.log("Broadcasting message to receiver:", message.receiverId);
        receiverWs.send(JSON.stringify({
          type: "newMessage",
          payload: message
        }));
        const senderWs = clients.get(message.senderId);
        if (senderWs?.readyState === WebSocket.OPEN) {
          senderWs.send(JSON.stringify({
            type: "newMessage",
            payload: {
              ...message,
              // Ensure the message contains BOTH senderId and receiverId
              senderId: message.senderId,
              receiverId: message.receiverId
            }
          }));
        }
      } else {
        console.log("Receiver WebSocket not found or not open:", message.receiverId);
      }
      res.json(message);
    } catch (err) {
      console.error("Message creation error:", err);
      res.status(400).json({ error: "Invalid message data" });
    }
  });
  app2.get("/api/messages/:userId", async (req, res) => {
    try {
      const currentUserId = parseInt(req.query.currentUserId);
      const otherUserId = parseInt(req.params.userId);
      if (isNaN(currentUserId) || isNaN(otherUserId)) {
        return res.status(400).json({ error: "Invalid user IDs" });
      }
      if (currentUserId === otherUserId) {
        return res.status(400).json({ error: "Cannot fetch messages sent to yourself" });
      }
      console.log("Fetching messages between users:", {
        currentUserId,
        otherUserId
      });
      const messages2 = await storage.getMessagesBetweenUsers(currentUserId, otherUserId);
      console.log("Found messages:", messages2.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        receiverId: m.receiverId,
        content: m.content?.substring(0, 20) + "..."
      })));
      res.json(messages2);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });
  app2.patch("/api/messages/:id/edit", async (req, res) => {
    const messageId = parseInt(req.params.id);
    const content = z2.string().parse(req.body.content);
    await storage.editMessage(messageId, content);
    res.json({ success: true });
  });
  app2.patch("/api/messages/:id/delete", async (req, res) => {
    const messageId = parseInt(req.params.id);
    await storage.deleteMessage(messageId);
    res.json({ success: true });
  });
  app2.get("/api/users", async (req, res) => {
    const currentUserId = parseInt(req.query.currentUserId);
    console.log("Fetching users except:", currentUserId);
    if (isNaN(currentUserId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    const allUsers = await storage.getAllUsers(currentUserId);
    console.log("Found users:", allUsers.map((u) => u.id));
    res.json(allUsers);
  });
  app2.get("/api/chats", async (req, res) => {
    const userId = parseInt(req.query.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    const chats = await storage.getUserChats(userId);
    res.json(chats);
  });
  const __filename4 = fileURLToPath2(import.meta.url);
  const __dirname4 = path2.dirname(__filename4);
  const uploadsDir = path2.join(__dirname4, "..", "uploads");
  (async () => {
    try {
      await mkdir(uploadsDir, { recursive: true });
      console.log("Uploads directory created at:", uploadsDir);
    } catch (error) {
      console.error("Error creating uploads directory:", error);
    }
  })();
  app2.post("/api/upload", async (req, res) => {
    try {
      console.log("File upload request received");
      const fileName = `${randomBytes(16).toString("hex")}${path2.extname(req.headers["x-file-name"] || "")}`;
      const filePath = path2.join(uploadsDir, fileName);
      console.log("Saving file to:", filePath);
      const writeStream = createWriteStream(filePath);
      req.pipe(writeStream);
      await new Promise((resolve, reject) => {
        writeStream.on("finish", () => {
          console.log("File saved successfully:", fileName);
          resolve(null);
        });
        writeStream.on("error", (error) => {
          console.error("Error saving file:", error);
          reject(error);
        });
      });
      const fileUrl = `/uploads/${fileName}`;
      console.log("File URL:", fileUrl);
      res.json({ url: fileUrl });
    } catch (error) {
      console.error("File upload error:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });
  app2.get("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        id: user.id,
        googleId: user.googleId,
        email: user.email
      });
    } catch (error) {
      console.error("User fetch error:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });
  app2.patch("/api/users/:id/profile", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { avatarUrl, status, statusEmoji, hasStory } = req.body;
      await storage.updateUserProfile(userId, {
        avatarUrl,
        status,
        statusEmoji,
        hasStory
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });
  app2.patch("/api/users/:id/presence", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { lastSeen } = req.body;
      await storage.updateUserPresence(userId, new Date(lastSeen));
      res.json({ success: true });
    } catch (error) {
      console.error("Presence update error:", error);
      res.status(500).json({ error: "Failed to update presence" });
    }
  });
  app2.get("/api/users/:id/profile", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        status: user.status,
        statusEmoji: user.statusEmoji,
        online: user.online,
        lastSeen: user.lastSeen,
        hasStory: user.hasStory
      });
    } catch (error) {
      console.error("Profile fetch error:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });
  app2.use("/uploads", express.static(uploadsDir));
  return httpServer;
}
async function verifyGoogleToken(credential) {
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error("Invalid Google token");
    let user = await storage.getUserByEmail(payload.email);
    if (!user) {
      user = await storage.createUser({
        username: payload.email,
        email: payload.email,
        password: randomBytes(16).toString("hex"),
        emailVerified: true,
        googleId: payload.sub,
        // Add to your schema
        verificationToken: void 0,
        // Omit or set to undefined
        verificationTokenExpiry: void 0
      });
    }
    return {
      id: user.id,
      username: user.username
      // Non-null assertion
    };
  } catch (error) {
    console.error("Google authentication failed:", error);
    throw new Error("Invalid Google token");
  }
}

// server/vite.ts
import express2 from "express";
import fs from "fs";
import path4, { dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath4 } from "url";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path3, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath as fileURLToPath3 } from "url";
var __filename2 = fileURLToPath3(import.meta.url);
var __dirname2 = dirname(__filename2);
var vite_config_default = defineConfig({
  plugins: [react(), runtimeErrorOverlay(), themePlugin()],
  resolve: {
    alias: {
      "@": path3.resolve(__dirname2, "./client/src"),
      "@shared": path3.resolve(__dirname2, "./shared")
    }
  },
  root: path3.resolve(__dirname2, "client"),
  build: {
    outDir: path3.resolve(__dirname2, "dist/public"),
    emptyOutDir: true
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var __filename3 = fileURLToPath4(import.meta.url);
var __dirname3 = dirname2(__filename3);
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: void 0
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path4.resolve(
        __dirname3,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path4.resolve(__dirname3, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express2.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path4.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express3();
app.use(express3.json());
app.use(express3.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path5 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path5.startsWith("/api")) {
      let logLine = `${req.method} ${path5} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const PORT = Number(process.env.PORT) || 5001;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
})();
