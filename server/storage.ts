import { users, messages, type User, type InsertUser, type Message, type InsertMessage } from "@shared/schema.ts";
import { DbStorage } from "./db-storage.ts";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  setUserOnline(id: number, online: boolean): Promise<void>;
  getAllUsers(exceptUserId: number): Promise<User[]>;
  getVerificationToken(token: string): Promise<User | undefined>;
  verifyUserEmail(id: number): Promise<void>;
  updateVerificationToken(id: number, token: string, expiry: Date): Promise<void>;
  clearVerificationToken(id: number): Promise<void>; // Add this
  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getMessage(id: number): Promise<Message | undefined>;
  getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]>;
  deleteMessage(id: number): Promise<void>;
  editMessage(id: number, content: string): Promise<void>;

  // Chat operations
  getUserChats(userId: number): Promise<{ userId: number, lastMessage?: Message }[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private messages: Map<number, Message>;
  private currentUserId: number;
  private currentMessageId: number;

  constructor() {
    this.users = new Map();
    this.messages = new Map();
    this.currentUserId = 1;
    this.currentMessageId = 1;
  }

  async getAllUsers(exceptUserId: number): Promise<User[]> {
    return Array.from(this.users.values())
      .filter(user => user.id !== exceptUserId)
      .sort((a, b) => (a.username ?? '').localeCompare(b.username ?? '')); // Fallback to empty string
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = {
      ...insertUser,
      id,
      online: false,
      email: insertUser.email ?? null,
      googleId: insertUser.googleId ?? null,
      password: insertUser.password ?? null,
      emailVerified: false,
      verificationToken: null,
      verificationTokenExpiry: null,
      username: insertUser.username ?? insertUser.email!, // Fallback to email if username is null
    };
    this.users.set(id, user);
    return user;
  }






  async setUserOnline(id: number, online: boolean): Promise<void> {
    const user = await this.getUser(id);
    if (user) {
      this.users.set(id, { ...user, online });
    }
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const id = this.currentMessageId++;
    const newMessage: Message = {
      ...message,
      id,
      createdAt: new Date(),
      deleted: false,
      mediaUrl: message.mediaUrl ?? null, // Ensure mediaUrl is string | null
    };
    this.messages.set(id, newMessage);
    return newMessage;
  }

  async getMessage(id: number): Promise<Message | undefined> {
    return this.messages.get(id);
  }

  async getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(msg =>
        (msg.senderId === user1Id && msg.receiverId === user2Id) ||
        (msg.senderId === user2Id && msg.receiverId === user1Id)
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async deleteMessage(id: number): Promise<void> {
    const message = await this.getMessage(id);
    if (message) {
      this.messages.set(id, { ...message, deleted: true });
    }
  }

  async editMessage(id: number, content: string): Promise<void> {
    const message = await this.getMessage(id);
    if (message) {
      this.messages.set(id, { ...message, content });
    }
  }

  async getUserChats(userId: number): Promise<{ userId: number, lastMessage?: Message }[]> {
    const allMessages = Array.from(this.messages.values())
      .filter(msg => msg.senderId === userId || msg.receiverId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const chatUsers = new Set<number>();
    const chats: { userId: number, lastMessage?: Message }[] = [];

    allMessages.forEach(msg => {
      const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!chatUsers.has(otherUserId)) {
        chatUsers.add(otherUserId);
        chats.push({ userId: otherUserId, lastMessage: msg });
      }
    });

    return chats;
  }
  async getAllUserData(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getVerificationToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user =>
      user.verificationToken === token &&
      user.verificationTokenExpiry &&
      user.verificationTokenExpiry > new Date()
    );
  }


  async clearVerificationToken(id: number): Promise<void> {
    const user = await this.getUser(id);
    if (user) {
      this.users.set(id, { 
        ...user,
        verificationToken: null,
        verificationTokenExpiry: null
      });
    }
  }

  async verifyUserEmail(id: number): Promise<void> {
    const user = await this.getUser(id);
    if (user) {
      this.users.set(id, { 
        ...user,
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null
      });
    }
  }
  
async updateVerificationToken(id: number, token: string, expiry: Date): Promise<void> {
  const user = await this.getUser(id);
  if (user) {
    this.users.set(id, { 
      ...user,
      verificationToken: token,
      verificationTokenExpiry: expiry
    });
  }




  
}







}

export const storage = new DbStorage();