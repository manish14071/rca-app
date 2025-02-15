import { OAuth2Client } from 'google-auth-library';
import { storage } from './storage.ts';
import { randomBytes } from 'crypto';
export async function verifyGoogleToken(token: string) {
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error('Invalid Google token');

    // Destructure correctly
    const { email, sub: googleId } = payload;

    let user = await storage.getUserByEmail(email);

    if (!user) {
      user = await storage.createUser({
        username: email,
        email: email,
        googleId, // Add to schema
        password: randomBytes(16).toString('hex'),
        emailVerified: true,
        verificationToken: undefined, // Use undefined instead of null
    verificationTokenExpiry: undefined
      });
    }

    return { id: user.id, username: user.username! };
  } catch (error) {
    console.error('Google token verification failed:', error);
    throw new Error('Invalid Google token');
  }
}