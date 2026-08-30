import { getPool, closePool } from '../db/pg';

/**
 * Database connection — PostgreSQL.
 *
 * NationMart runs entirely on PostgreSQL. The pool is created lazily on first
 * query; this simply proves the connection at boot so a bad DATABASE_URL fails
 * loudly at startup rather than on a customer's first checkout.
 */
export async function connectDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. NationMart requires PostgreSQL.');
  }
  const pool = getPool();
  const { rows } = await pool.query('SELECT current_database() AS db, version() AS v');
  console.log(`[db] PostgreSQL connected — ${rows[0].db}`);
}

export async function disconnectDatabase(): Promise<void> {
  await closePool();
}

export default connectDatabase;
