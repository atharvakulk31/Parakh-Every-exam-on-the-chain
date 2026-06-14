import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = process.env.DB_PATH ?? path.join(DATA_DIR, "examshield.db");
export const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  encryptedText TEXT NOT NULL,
  marks INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS papers (
  paperId TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  variantIds TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS centers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  variant TEXT,
  paperId TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  custody TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS assignments (
  rollNumber TEXT PRIMARY KEY,
  centerId TEXT NOT NULL,
  paperId TEXT NOT NULL,
  variant TEXT NOT NULL,
  blockHash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scripts (
  code TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  paperId TEXT NOT NULL,
  variant TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  marks INTEGER,
  evaluatedBy TEXT
);
CREATE TABLE IF NOT EXISTS flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  centerId TEXT NOT NULL,
  candidate TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  decidedBy TEXT
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  family TEXT NOT NULL,
  sid TEXT NOT NULL,
  expiresAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lockouts (
  username TEXT PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  lockedUntil INTEGER
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  userId TEXT,
  role TEXT,
  ip TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  action TEXT NOT NULL,
  status INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chain_blocks (
  idx INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  event TEXT NOT NULL,
  data TEXT NOT NULL,
  prevHash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS live_stats (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS exam_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS exam_submissions (
  rollNumber TEXT PRIMARY KEY,
  answers TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT -1,
  total INTEGER NOT NULL DEFAULT 0,
  submittedAt TEXT NOT NULL,
  graded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS answer_keys (
  questionId TEXT PRIMARY KEY,
  encryptedAnswer TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
`);

// Safe column migrations — ignored if column already exists
for (const sql of [
  "ALTER TABLE exam_submissions ADD COLUMN graded INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE questions ADD COLUMN options TEXT",
  "ALTER TABLE questions ADD COLUMN correctAnswer INTEGER",
  "ALTER TABLE questions ADD COLUMN plainText TEXT",
  "ALTER TABLE papers ADD COLUMN questionIds TEXT",
  "ALTER TABLE papers ADD COLUMN title TEXT",
  "ALTER TABLE papers ADD COLUMN paperHash TEXT",
  "ALTER TABLE papers ADD COLUMN finalizedBy TEXT",
  "ALTER TABLE papers ADD COLUMN finalizedAt TEXT",
  "ALTER TABLE papers ADD COLUMN variantQuestionIds TEXT",
]) {
  try { db.exec(sql); } catch { /* already exists */ }
}
