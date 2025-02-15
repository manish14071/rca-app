// server/index.ts
import express3 from "express";

// server/routes.ts
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

// server/storage.ts
var MemStorage = class {
  constructor() {
    this.users = /* @__PURE__ */ new Map();
    this.messages = /* @__PURE__ */ new Map();
    this.currentUserId = 1;
    this.currentMessageId = 1;
  }
  async getAllUsers(exceptUserId) {
    return Array.from(this.users.values()).filter((user) => user.id !== exceptUserId).sort((a, b) => a.username.localeCompare(b.username));
  }
  async getUser(id) {
    return this.users.get(id);
  }
  async getUserByUsername(username) {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }
  async getUserByEmail(email) {
    return Array.from(this.users.values()).find((user) => user.email === email);
  }
  async createUser(insertUser) {
    const id = this.currentUserId++;
    const user = {
      ...insertUser,
      id,
      online: false,
      email: insertUser.email ?? null,
      googleId: insertUser.googleId ?? null,
      password: insertUser.password ?? null
    };
    this.users.set(id, user);
    return user;
  }
  async setUserOnline(id, online) {
    const user = await this.getUser(id);
    if (user) {
      this.users.set(id, { ...user, online });
    }
  }
  async createMessage(message) {
    const id = this.currentMessageId++;
    const newMessage = {
      ...message,
      id,
      createdAt: /* @__PURE__ */ new Date(),
      deleted: false,
      mediaUrl: message.mediaUrl ?? null
      // Ensure mediaUrl is string | null
    };
    this.messages.set(id, newMessage);
    return newMessage;
  }
  async getMessage(id) {
    return this.messages.get(id);
  }
  async getMessagesBetweenUsers(user1Id, user2Id) {
    return Array.from(this.messages.values()).filter(
      (msg) => msg.senderId === user1Id && msg.receiverId === user2Id || msg.senderId === user2Id && msg.receiverId === user1Id
    ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async deleteMessage(id) {
    const message = await this.getMessage(id);
    if (message) {
      this.messages.set(id, { ...message, deleted: true });
    }
  }
  async editMessage(id, content) {
    const message = await this.getMessage(id);
    if (message) {
      this.messages.set(id, { ...message, content });
    }
  }
  async getUserChats(userId) {
    const allMessages = Array.from(this.messages.values()).filter((msg) => msg.senderId === userId || msg.receiverId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const chatUsers = /* @__PURE__ */ new Set();
    const chats = [];
    allMessages.forEach((msg) => {
      const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!chatUsers.has(otherUserId)) {
        chatUsers.add(otherUserId);
        chats.push({ userId: otherUserId, lastMessage: msg });
      }
    });
    return chats;
  }
  async getAllUserData() {
    return Array.from(this.users.values());
  }
};
var storage = new MemStorage();

// shared/schema.ts
import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password"),
  // Optional for Google auth users
  email: text("email").unique(),
  googleId: text("google_id").unique(),
  online: boolean("online").default(false).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  verificationToken: text("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry")
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
var insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  googleId: true
}).partial({
  password: true,
  googleId: true,
  email: true
});
var insertMessageSchema = createInsertSchema(messages).pick({
  content: true,
  senderId: true,
  receiverId: true,
  mediaUrl: true
});

// server/routes.ts
import { z } from "zod";
import { randomBytes } from "crypto";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
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
      const userData = insertUserSchema.parse(req.body);
      console.log("Registration attempt:", { username: userData.username });
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        console.log("Registration failed: Username already exists");
        return res.status(400).json({ error: "Username already exists" });
      }
      const user = await storage.createUser(userData);
      console.log("Registration successful:", { id: user.id, username: user.username });
      res.json({ id: user.id, username: user.username });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(400).json({ error: "Invalid user data" });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = insertUserSchema.parse(req.body);
      console.log("Login attempt:", { username });
      const user = await storage.getUserByUsername(username);
      console.log("Found user:", user ? { id: user.id, username: user.username } : "null");
      if (!user || user.password !== password) {
        console.log("Login failed: Invalid credentials");
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const allUsers = await storage.getAllUserData();
      console.log("All users:", allUsers.map((u) => ({ id: u.id, username: u.username })));
      console.log("Login successful:", { id: user.id, username: user.username });
      res.json({ id: user.id, username: user.username });
    } catch (err) {
      console.error("Login error:", err);
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
  app2.post("/api/messages", async (req, res) => {
    try {
      const messageData = insertMessageSchema.parse(req.body);
      console.log("Creating message:", messageData);
      const message = await storage.createMessage(messageData);
      console.log("Message created:", message);
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
            payload: message
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
      console.log(`Fetching messages between users ${currentUserId} and ${otherUserId}`);
      const messages2 = await storage.getMessagesBetweenUsers(currentUserId, otherUserId);
      console.log("Found messages:", messages2);
      res.json(messages2);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });
  app2.patch("/api/messages/:id/edit", async (req, res) => {
    const messageId = parseInt(req.params.id);
    const content = z.string().parse(req.body.content);
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
    if (isNaN(currentUserId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    const allUsers = await storage.getAllUsers(currentUserId);
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
  const __filename3 = fileURLToPath(import.meta.url);
  const __dirname3 = path.dirname(__filename3);
  const uploadsDir = path.join(__dirname3, "..", "uploads");
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
      const fileName = `${randomBytes(16).toString("hex")}${path.extname(req.headers["x-file-name"] || "")}`;
      const filePath = path.join(uploadsDir, fileName);
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
  app2.use("/uploads", express.static(uploadsDir));
  return httpServer;
}
async function verifyGoogleToken(credential) {
  throw new Error("Function not implemented.");
}

// server/vite.ts
import express2 from "express";
import fs from "fs";
import path3, { dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path2, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath as fileURLToPath2 } from "url";
var __filename = fileURLToPath2(import.meta.url);
var __dirname = dirname(__filename);
var vite_config_default = defineConfig({
  plugins: [react(), runtimeErrorOverlay(), themePlugin()],
  resolve: {
    alias: {
      "@": path2.resolve(__dirname, "client", "src"),
      "@shared": path2.resolve(__dirname, "shared")
    }
  },
  root: path2.resolve(__dirname, "client"),
  build: {
    outDir: path2.resolve(__dirname, "dist/public"),
    emptyOutDir: true
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var __filename2 = fileURLToPath3(import.meta.url);
var __dirname2 = dirname2(__filename2);
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
    allowedHosts: true
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
      const clientTemplate = path3.resolve(
        __dirname2,
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
  const distPath = path3.resolve(__dirname2, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express2.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express3();
app.use(express3.json());
app.use(express3.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path4 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path4.startsWith("/api")) {
      let logLine = `${req.method} ${path4} ${res.statusCode} in ${duration}ms`;
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
  const PORT = 5e3;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
})();
