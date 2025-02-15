import { DbStorage } from "./db-storage.ts";

// Correct typos and syntax
async function testMessages() {
  try {
    const storage = new DbStorage();
    console.log('Running message tests...\n');

    // Test 1: Create users
    const user1 = await storage.createUser({
      username: `sender_${Date.now()}`, // Fixed typo
      password: 'test123',
    });
    
    const user2 = await storage.createUser({
      username: `receiver_${Date.now()}`, // Fixed typo
      password: 'test123',
    });

    // Test 2: Send message
    const message = await storage.createMessage({
      content: 'Test message',
      senderId: user1.id,
      receiverId: user2.id
    });

    console.log('Message tests completed successfully');
  } catch (error) {
    console.error('Message tests failed:', error);
  }
}