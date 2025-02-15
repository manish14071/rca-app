import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export async function up(db: PostgresJsDatabase) {
  await db.execute(sql`
    UPDATE users 
    SET email = 'temp-' || id || '@example.com' 
    WHERE email IS NULL
  `);

  await db.execute(sql`
    ALTER TABLE users 
    ALTER COLUMN email SET NOT NULL
  `);
}

export async function down(db: PostgresJsDatabase) {
  await db.execute(sql`
    ALTER TABLE users 
    ALTER COLUMN email DROP NOT NULL
  `);
}