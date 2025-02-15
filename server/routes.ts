import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage.ts";
import { insertUserSchema, insertMessageSchema } from "@shared/schema.ts";
import { z } from "zod";
import { randomBytes } from 'crypto';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from "path";
import { fileURLToPath } from 'url';
import express from 'express';
import { OAuth2Client } from "google-auth-library";
import { sendVerificationEmail } from "./email-service.ts";




interface WSMessage {
  type: string;
  payload: any;
}

interface ExtWebSocket extends WebSocket {
  userId?: number;
  isAlive?: boolean;
}

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    clientTracking: true
  });

  console.log('[WebSocket] Server initialized on path: /ws');

  const clients = new Map<number, ExtWebSocket>();

  // Set up ping interval to keep connections alive
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws: ExtWebSocket) => {
      if (ws.isAlive === false) {
        console.log('[WebSocket] Client timed out, terminating connection');
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  wss.on('connection', (ws: ExtWebSocket, req) => {
    console.log('[WebSocket] New connection from:', req.socket.remoteAddress);

    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());
        console.log('[WebSocket] Received message:', message);

        switch (message.type) {
          case 'auth':
            ws.userId = message.payload.userId;
            if (ws.userId) {
              // Remove any existing connection for this user
              const existingConnection = clients.get(ws.userId);
              if (existingConnection) {
                console.log('[WebSocket] Closing existing connection for user:', ws.userId);
                existingConnection.close();
              }

              clients.set(ws.userId, ws);
              await storage.setUserOnline(ws.userId, true);
              broadcastUserStatus(ws.userId, true);
              console.log(`[WebSocket] User ${ws.userId} authenticated. Active clients:`, Array.from(clients.keys()));
            }
            break;

          case 'typing':
            if (ws.userId) {
              const receiverWs = clients.get(message.payload.receiverId);
              if (receiverWs?.readyState === WebSocket.OPEN) {
                receiverWs.send(JSON.stringify({
                  type: 'typing',
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
        console.error('[WebSocket] Message error:', err);
        ws.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Failed to process message' }
        }));
      }
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });

    ws.on('close', async () => {
      if (ws.userId) {
        console.log(`[WebSocket] User ${ws.userId} disconnected`);
        clients.delete(ws.userId);
        await storage.setUserOnline(ws.userId, false);
        broadcastUserStatus(ws.userId, false);
      }
    });
  });

  function broadcastUserStatus(userId: number, online: boolean) {
    const message = JSON.stringify({
      type: 'userStatus',
      payload: { userId, online }
    });

    console.log(`[WebSocket] Broadcasting user status: ${userId} is ${online ? 'online' : 'offline'}`);

    Array.from(clients.values()).forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Auth routes
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // Validate with schema
      const userData = {
        username: email,
        email,
        password,
        emailVerified: false,
        verificationToken: randomBytes(32).toString('hex'),
        verificationTokenExpiry: new Date(Date.now() + 3600000),
      };
  
      const validatedData = insertUserSchema.parse(userData);
  
      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'Email already exists' });
      }
  
      // Create user
      const user = await storage.createUser(validatedData);
  
      // Send verification email
      await sendVerificationEmail(email, userData.verificationToken);
  
      // Send a single response
      res.json({ message: 'Check your email for verification instructions' });
    } catch (err) {
      // Return detailed validation errors
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: err.errors,
        });
      }
      console.error('Registration error:', err);
      res.status(400).json({ error: 'Invalid registration data' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await storage.getUserByEmail(email);

      // Check credentials
      if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check verification status
      if (!user.emailVerified) {
        return res.status(403).json({
          error: 'Email not verified',
          needsVerification: true
        });
      }

      res.json({ id: user.id, email: user.email });
    } catch (err) {
      res.status(400).json({ error: 'Invalid login data' });
    }
  });










  // Add this new route handler within the existing routes
  app.post('/api/auth/google', async (req, res) => {
    try {
      const { credential } = req.body;

      if (!credential) {
        return res.status(400).json({ error: 'Google credential is required' });
      }

      const user = await verifyGoogleToken(credential);
      console.log('Google authentication successful:', { id: user.id, username: user.username });
      res.json({ id: user.id, username: user.username });
    } catch (error) {
      console.error('Google authentication error:', error);
      res.status(401).json({ error: 'Google authentication failed' });
    }
  });



  app.post('/api/auth/verify-email', async (req, res) => {
    try {
      const { token } = req.body;
      const user = await storage.getVerificationToken(token);
  
      if (!user) {
        console.log('Invalid verification token:', token);
        return res.status(400).json({ error: 'Invalid or expired token' });
      }
  
      // Check if token has expired
      if (user.verificationTokenExpiry && new Date() > new Date(user.verificationTokenExpiry)) {
        console.log('Token expired for user:', user.id);
        return res.status(400).json({ error: 'Verification token has expired' });
      }
  
      // Update user's email verification status
      try {
        await storage.verifyUserEmail(user.id);
        console.log('Successfully verified email for user:', user.id);
        
        // Also clear the verification token and expiry
       await storage.clearVerificationToken(user.id);
        
        res.json({ success: true });
      } catch (updateError) {
        console.error('Failed to update user verification status:', updateError);
        res.status(500).json({ error: 'Failed to verify email' });
      }
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ error: 'Verification failed' });
    }
  }); 






  // Message routes
  // Update the message route to properly handle real-time messages
  app.post('/api/messages', async (req, res) => {
    try {
      console.log('Raw message data:', req.body); // Add this line
      const messageData = insertMessageSchema.parse({ ...req.body, mediaUrl: req.body.mediaUrl || null })
      if (!messageData.content?.trim() && !messageData.mediaUrl) {
        return res.status(400).json({ error: 'Message content or media required' });
      }
      console.log('Parsed message data:', messageData); // Add this line

      // Validate that sender and receiver are different
      if (messageData.senderId === messageData.receiverId) {
        console.error('Invalid message: sender and receiver are the same:', messageData);
        return res.status(400).json({ error: 'Cannot send message to yourself' });
      }

      const message = await storage.createMessage(messageData);
      console.log('Created message:', message);

      // Send message to receiver via WebSocket
      const receiverWs = clients.get(message.receiverId);
      if (receiverWs?.readyState === WebSocket.OPEN) {
        console.log('Broadcasting message to receiver:', message.receiverId);
        receiverWs.send(JSON.stringify({
          type: 'newMessage',
          payload: message
        }));

        // Also send a copy to the sender for their UI update
        const senderWs = clients.get(message.senderId);
        if (senderWs?.readyState === WebSocket.OPEN) {
          senderWs.send(JSON.stringify({
            type: 'newMessage',
            payload: {
              ...message,
              // Ensure the message contains BOTH senderId and receiverId
              senderId: message.senderId,
              receiverId: message.receiverId
            }
          }));
        }
      } else {
        console.log('Receiver WebSocket not found or not open:', message.receiverId);
      }

      res.json(message);
    } catch (err) {
      console.error('Message creation error:', err);
      res.status(400).json({ error: 'Invalid message data' });
    }
  });

  // Update the messages route to properly fetch messages between users
  app.get('/api/messages/:userId', async (req, res) => {
    try {
      const currentUserId = parseInt(req.query.currentUserId as string);
      const otherUserId = parseInt(req.params.userId);

      if (isNaN(currentUserId) || isNaN(otherUserId)) {
        return res.status(400).json({ error: 'Invalid user IDs' });
      }

      if (currentUserId === otherUserId) {
        return res.status(400).json({ error: 'Cannot fetch messages sent to yourself' });
      }

      console.log('Fetching messages between users:', {
        currentUserId,
        otherUserId
      });

      const messages = await storage.getMessagesBetweenUsers(currentUserId, otherUserId);

      console.log('Found messages:', messages.map(m => ({
        id: m.id,
        senderId: m.senderId,
        receiverId: m.receiverId,
        content: m.content?.substring(0, 20) + '...'
      })));

      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.patch('/api/messages/:id/edit', async (req, res) => {
    const messageId = parseInt(req.params.id);
    const content = z.string().parse(req.body.content);

    await storage.editMessage(messageId, content);
    res.json({ success: true });
  });

  app.patch('/api/messages/:id/delete', async (req, res) => {
    const messageId = parseInt(req.params.id);
    await storage.deleteMessage(messageId);
    res.json({ success: true });
  });

  // Users and chat routes
  app.get('/api/users', async (req, res) => {
    const currentUserId = parseInt(req.query.currentUserId as string);
    console.log('Fetching users except:', currentUserId); // 👈 Add 
    if (isNaN(currentUserId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const allUsers = await storage.getAllUsers(currentUserId);
    console.log('Found users:', allUsers.map(u => u.id)); // 👈 See returned user
    res.json(allUsers);
  });

  app.get('/api/chats', async (req, res) => {
    const userId = parseInt(req.query.userId as string);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const chats = await storage.getUserChats(userId);
    res.json(chats);
  });

  // File handling setup
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const uploadsDir = path.join(__dirname, '..', 'uploads');

  // Create uploads directory
  (async () => {
    try {
      await mkdir(uploadsDir, { recursive: true });
      console.log('Uploads directory created at:', uploadsDir);
    } catch (error) {
      console.error('Error creating uploads directory:', error);
    }
  })();

  // File upload endpoint
  app.post('/api/upload', async (req, res) => {
    try {
      console.log('File upload request received');
      // Create a unique filename
      const fileName = `${randomBytes(16).toString('hex')}${path.extname(req.headers['x-file-name'] as string || '')}`;
      const filePath = path.join(uploadsDir, fileName);
      console.log('Saving file to:', filePath);

      // Stream the file to disk
      const writeStream = createWriteStream(filePath);
      req.pipe(writeStream);

      await new Promise((resolve, reject) => {
        writeStream.on('finish', () => {
          console.log('File saved successfully:', fileName);
          resolve(null);
        });
        writeStream.on('error', (error) => {
          console.error('Error saving file:', error);
          reject(error);
        });
      });

      // Return the URL that can be used to access the file
      const fileUrl = `/uploads/${fileName}`;
      console.log('File URL:', fileUrl);
      res.json({ url: fileUrl });
    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });


  app.get('/api/users/:id', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Return only necessary information
      res.json({
        id: user.id,
        googleId: user.googleId,
        email: user.email
      });
    } catch (error) {
      console.error('User fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });


  // Add new user profile endpoints
app.patch('/api/users/:id/profile', async (req, res) => {
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
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.patch('/api/users/:id/presence', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { lastSeen } = req.body;
    
    await storage.updateUserPresence(userId, new Date(lastSeen));
    res.json({ success: true });
  } catch (error) {
    console.error('Presence update error:', error);
    res.status(500).json({ error: 'Failed to update presence' });
  }
});

// Add this with other user routes
app.get('/api/users/:id/profile', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});


  // Serve uploaded files
  app.use('/uploads', express.static(uploadsDir));

  return httpServer;



  


  // Placeholder -  This function needs to be implemented to verify the Google token.







}





// Import schema for type inference

// Updated verifyGoogleToken function
async function verifyGoogleToken(credential: string): Promise<{ id: number; username: string }> {
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID!);

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID!,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error('Invalid Google token');

    // Check if user exists using email as identifier
    let user = await storage.getUserByEmail(payload.email);

    if (!user) {
      // Create new user with Google-specific fields
      user = await storage.createUser({
        username: payload.email,
        email: payload.email,
        password: randomBytes(16).toString('hex'),
        emailVerified: true,
        googleId: payload.sub, // Add to your schema
        verificationToken: undefined, // Omit or set to undefined
        verificationTokenExpiry: undefined
      });
    }

    return {
      id: user.id,
      username: user.username! // Non-null assertion
    };
  } catch (error) {
    console.error('Google authentication failed:', error);
    throw new Error('Invalid Google token');
  }
}










