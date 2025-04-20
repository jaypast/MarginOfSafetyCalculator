import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Check if we have a database URL
const hasDatabaseUrl = !!process.env.DATABASE_URL;

// Create pool only if we have a DATABASE_URL
export const pool = hasDatabaseUrl 
  ? new Pool({ connectionString: process.env.DATABASE_URL }) 
  : null;

// Create drizzle instance if we have a pool
export const db = pool 
  ? drizzle({ client: pool, schema })
  : null;

// Log database connection status
console.log(`Database connection: ${hasDatabaseUrl ? 'Available' : 'Not available - using fallback storage'}`);
