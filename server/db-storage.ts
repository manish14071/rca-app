import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users, messages, type User, type InsertUser, type Message, type InsertMessage } from "../shared/schema.js";
import { eq, or, and, desc,ne,asc,gt } from 'drizzle-orm';
import { IStorage } from './storage.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log('Environment loaded from:', path.resolve(__dirname, '../.env'));
console.log('DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 20) + '...');

export class DbStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not defined');
    }
    const client = postgres(connectionString);
    this.db = drizzle(client);
  }

  async getAllUsers(exceptUserId: number): Promise<User[]> {
    return await this.db.select()
      .from(users)
      .where(ne(users.id, exceptUserId));
  }

  async getUser(id: number): Promise<User | undefined> {
    const results = await this.db.select()
      .from(users)
      .where(eq(users.id, id));
    return results[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const results = await this.db.select()
      .from(users)
      .where(eq(users.username, username));
    return results[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const results = await this.db.select()
      .from(users)
      .where(eq(users.email, email));
    return results[0];
  }

  async createUser(userData: InsertUser): Promise<User> {
    // Ensure username is populated
    const finalData = {
      ...userData,
      username: userData.username || userData.email
    };
  
    const result = await this.db.insert(users)
      .values(finalData)
      .returning();
    return result[0];
  }


  async clearVerificationToken(userId: number): Promise<void> {
    await this.db.update(users)
      .set({ 
        verificationToken: null,
        verificationTokenExpiry: null
      })
      .where(eq(users.id, userId));
  }



  async setUserOnline(id: number, online: boolean): Promise<void> {
    await this.db.update(users)
      .set({ online })
      .where(eq(users.id, id));
  }

  // Message operations
  async createMessage(messageData: InsertMessage): Promise<Message> {
    console.log('Creating message in DB:', messageData); // Add debug log
    
    // Validate sender and receiver
    if (messageData.senderId === messageData.receiverId) {
      throw new Error('Cannot send message to yourself');
    }
  
    const result = await this.db.insert(messages)
      .values({
        ...messageData,
        createdAt: new Date(),
        deleted: false,
        mediaUrl: messageData.mediaUrl || null,
      })
      .returning();
    
    console.log('DB returned message:', result[0]); // Add debug log
    return result[0];
  }

  async getMessage(id: number): Promise<Message | undefined> {
    const results = await this.db.select()
      .from(messages)
      .where(eq(messages.id, id));
    return results[0];
  }

  async getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]> {
    return await this.db.select()
      .from(messages)
      .where(
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
      )
      .orderBy(asc(messages.createdAt)); // 
  }

  async deleteMessage(id: number): Promise<void> {
    await this.db.update(messages)
      .set({ deleted: true })
      .where(eq(messages.id, id));
  }

  async editMessage(id: number, content: string): Promise<void> {
    await this.db.update(messages)
      .set({ content })
      .where(eq(messages.id, id));
  }

  async getUserChats(userId: number): Promise<{ userId: number, lastMessage?: Message }[]> {
    const userMessages = await this.db.select()
      .from(messages)
      .where(
        or(
          eq(messages.senderId, userId),
          eq(messages.receiverId, userId)
        )
      )
      .orderBy(desc(messages.createdAt));

    const chatMap = new Map<number, { userId: number, lastMessage?: Message }>();
    
    userMessages.forEach(msg => {
      const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!chatMap.has(otherUserId)) {
        chatMap.set(otherUserId, { userId: otherUserId, lastMessage: msg });
      }
    });

    return Array.from(chatMap.values());
  }

  async getAllUserData(): Promise<User[]> {
    return await this.db.select().from(users);
  }


  async getVerificationToken(token: string): Promise<User | undefined> {
    return this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.verificationToken, token),
          gt(users.verificationTokenExpiry, new Date())
        )
      )
      .limit(1)
      .then(res => res[0]);
  }
  

  



  async verifyUserEmail(id: number): Promise<void> {
    await this.db.update(users)
      .set({ 
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null
      })
      .where(eq(users.id, id));
  }


  async updateVerificationToken(id: number, token: string, expiry: Date): Promise<void> {
    await this.db.update(users)
      .set({ 
        verificationToken: token,
        verificationTokenExpiry: expiry
      })
      .where(eq(users.id, id));
  }

  async updateUserProfile(userId: number, profileData: {
    avatarUrl?: string;
    status?: string;
    statusEmoji?: string;
    hasStory?: boolean;
  }) {
    await this.db.update(users)
      .set(profileData)
      .where(eq(users.id, userId));
  }
  
  async updateUserPresence(userId: number, lastSeen: Date) {
    await this.db.update(users)
      .set({ lastSeen })
      .where(eq(users.id, userId));
  }




}