/**
 * SQLite cache layer — single responsibility: get/set with TTL.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

mkdirSync(config.cacheDir, { recursive: true });

const db = new Database(join(config.cacheDir, "cache.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created INTEGER NOT NULL
  )
`);

const cacheGet = db.prepare("SELECT data FROM cache WHERE key = ? AND created > ?");
const cacheSet = db.prepare("INSERT OR REPLACE INTO cache (key, data, created) VALUES (?, ?, ?)");

export function getCached(key) {
  const row = cacheGet.get(key, Math.floor(Date.now() / 1000) - config.cacheTtl);
  return row ? JSON.parse(row.data) : null;
}

export function setCache(key, data) {
  cacheSet.run(key, JSON.stringify(data), Math.floor(Date.now() / 1000));
}

export function getCacheCount() {
  return db.prepare("SELECT COUNT(*) as c FROM cache").get()?.c || 0;
}
