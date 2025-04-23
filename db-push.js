import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, pool } from './server/db.js';
import { users, stocks, feedback, undervaluedStock, undervaluedReport } from './shared/schema.js';

async function main() {
  console.log('Creating database tables...');
  
  try {
    // Create tables manually
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        satisfaction TEXT NOT NULL,
        main_benefit TEXT,
        improvements TEXT,
        email TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS undervalued_report (
        id SERIAL PRIMARY KEY,
        report_date TIMESTAMP NOT NULL DEFAULT NOW(),
        stocks_count INTEGER NOT NULL,
        indexes TEXT NOT NULL,
        is_pending BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT
      );
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS undervalued_stock (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(10) NOT NULL,
        name TEXT NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        eps DECIMAL(10, 2) NOT NULL,
        fcf_per_share DECIMAL(10, 2) NOT NULL,
        growth_rate DECIMAL(6, 2) NOT NULL,
        intrinsic_value DECIMAL(10, 2) NOT NULL,
        buy_below_price DECIMAL(10, 2) NOT NULL,
        discount_premium DECIMAL(6, 2) NOT NULL,
        quality TEXT NOT NULL,
        quality_score INTEGER NOT NULL,
        date_evaluated TIMESTAMP NOT NULL DEFAULT NOW(),
        report_id INTEGER NOT NULL
      );
    `);

    console.log('All tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    await pool.end();
  }
}

main();