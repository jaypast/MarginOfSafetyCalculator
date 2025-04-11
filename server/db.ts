import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Try to get DATABASE_URL from environment or use a fallback for development
const databaseUrl = process.env.DATABASE_URL || (process.env.NODE_ENV === 'production' ? null : 'postgresql://postgres:postgres@0.0.0.0:5432/postgres');

if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Please add it as a production secret in your deployment configuration.");
  process.exit(1);
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client: pool, schema });
