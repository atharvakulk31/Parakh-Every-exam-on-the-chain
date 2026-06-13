import bcrypt from "bcryptjs";
import { encrypt } from "./crypto.js";
import { db } from "./db.js";

export type Role = "student" | "teacher" | "admin";

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  name: string;
}

export interface Question {
  id: string;
  subject: string;
  topic: string;
  language: string;
  status: "pending" | "approved";
  encryptedText: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
  createdBy: string;
  createdAt: string;
}

export interface AuditEntry {
  id: number;
  timestamp: string;
  userId: string | null;
  role: Role | null;
  ip: string;
  method: string;
  path: string;
  action: string;
  status: number;
}

export interface RefreshRecord {
  userId: string;
  family: string;
  sid: string;
  expiresAt: number;
}

export interface LockoutRecord {
  fails: number;
  lockedUntil: number | null;
}

export interface Paper {
  paperId: string;
  subject: string;
  variantIds: string[];
}

export interface CustodyEntry {
  timestamp: string;
  event: string;
}

export interface Center {
  id: string;
  name: string;
  city: string;
  variant: string | null;
  paperId: string | null;
  status: "idle" | "sealed" | "unlocked";
  custody: CustodyEntry[];
}

export interface Assignment {
  rollNumber: string;
  centerId: string;
  paperId: string;
  variant: string;
  blockHash: string;
}

export interface Flag {
  id: number;
  timestamp: string;
  centerId: string;
  candidate: string;
  type: "tab_switch" | "fullscreen_exit" | "focus_loss" | "multiple_faces" | "no_face";
  severity: "low" | "medium" | "high";
  status: "open" | "confirmed" | "dismissed";
  decidedBy: string | null;
}

export interface Script {
  code: string;
  subject: string;
  paperId: string;
  variant: string;
  status: "pending" | "evaluated";
  marks: number | null;
  evaluatedBy: string | null;
}

// ─── Prepared statements ───────────────────────────────────────────────────

const stmts = {
  insertUser: db.prepare("INSERT OR IGNORE INTO users (id, username, passwordHash, role, name) VALUES (?, ?, ?, ?, ?)"),
  insertQuestion: db.prepare("INSERT OR IGNORE INTO questions (id, subject, topic, language, status, encryptedText, marks, difficulty, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"),
  approveQuestion: db.prepare("UPDATE questions SET status = 'approved' WHERE id = ?"),
  insertPaper: db.prepare("INSERT OR REPLACE INTO papers (paperId, subject, variantIds) VALUES (?, ?, ?)"),
  updateCenter: db.prepare("UPDATE centers SET variant = ?, paperId = ?, status = ?, custody = ? WHERE id = ?"),
  insertCenter: db.prepare("INSERT OR IGNORE INTO centers (id, name, city, variant, paperId, status, custody) VALUES (?, ?, ?, ?, ?, ?, '[]')"),
  insertAssignment: db.prepare("INSERT OR REPLACE INTO assignments (rollNumber, centerId, paperId, variant, blockHash) VALUES (?, ?, ?, ?, ?)"),
  insertScript: db.prepare("INSERT OR IGNORE INTO scripts (code, subject, paperId, variant, status, marks, evaluatedBy) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  updateScript: db.prepare("UPDATE scripts SET status = ?, marks = ?, evaluatedBy = ? WHERE code = ?"),
  insertFlag: db.prepare("INSERT INTO flags (timestamp, centerId, candidate, type, severity, status, decidedBy) VALUES (?, ?, ?, ?, ?, 'open', NULL)"),
  updateFlag: db.prepare("UPDATE flags SET status = ?, decidedBy = ? WHERE id = ?"),
  upsertStat: db.prepare("INSERT OR REPLACE INTO live_stats (key, value) VALUES (?, ?)"),
  upsertExamConfig: db.prepare("INSERT OR REPLACE INTO exam_config (key, value) VALUES (?, ?)"),
  insertAudit: db.prepare("INSERT INTO audit_log (timestamp, userId, role, ip, method, path, action, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
  setRefreshToken: db.prepare("INSERT OR REPLACE INTO refresh_tokens (token, userId, family, sid, expiresAt) VALUES (?, ?, ?, ?, ?)"),
  deleteRefreshToken: db.prepare("DELETE FROM refresh_tokens WHERE token = ?"),
  upsertLockout: db.prepare("INSERT OR REPLACE INTO lockouts (username, fails, lockedUntil) VALUES (?, ?, ?)"),
  deleteLockout: db.prepare("DELETE FROM lockouts WHERE username = ?"),
};

// ─── Users ─────────────────────────────────────────────────────────────────

const SALT = bcrypt.genSaltSync(10);
const SEED_USERS: User[] = [
  { id: "u-stu-1", username: "student1", passwordHash: bcrypt.hashSync("student123", SALT), role: "student", name: "Aarav Sharma" },
  { id: "u-tea-1", username: "teacher1", passwordHash: bcrypt.hashSync("teacher123", SALT), role: "teacher", name: "Prof. Meera Joshi" },
  { id: "u-adm-1", username: "admin1", passwordHash: bcrypt.hashSync("admin123", SALT), role: "admin", name: "Controller of Examinations" },
];
for (const u of SEED_USERS) stmts.insertUser.run(u.id, u.username, u.passwordHash, u.role, u.name);

export const users: User[] = db.prepare("SELECT * FROM users").all() as User[];

// ─── Questions ─────────────────────────────────────────────────────────────

export const questions: Question[] = db.prepare("SELECT * FROM questions ORDER BY createdAt").all() as Question[];

let qSeq = questions.reduce((max, q) => Math.max(max, parseInt(q.id.replace("Q-", ""), 10) || 0), 0);

export function addQuestion(q: {
  subject: string; text: string; marks: number; difficulty: Question["difficulty"];
  createdBy: string; topic?: string; language?: string; status?: Question["status"];
}): Question {
  const question: Question = {
    id: `Q-${String(++qSeq).padStart(4, "0")}`,
    subject: q.subject,
    topic: q.topic ?? "General",
    language: q.language ?? "English",
    status: q.status ?? "pending",
    encryptedText: encrypt(q.text),
    marks: q.marks,
    difficulty: q.difficulty,
    createdBy: q.createdBy,
    createdAt: new Date().toISOString(),
  };
  stmts.insertQuestion.run(question.id, question.subject, question.topic, question.language, question.status, question.encryptedText, question.marks, question.difficulty, question.createdBy, question.createdAt);
  questions.push(question);
  return question;
}

export function approveQuestion(id: string): void {
  stmts.approveQuestion.run(id);
  const q = questions.find((x) => x.id === id);
  if (q) q.status = "approved";
}

// ─── Papers ────────────────────────────────────────────────────────────────

export const papers: Paper[] = (db.prepare("SELECT * FROM papers").all() as any[]).map((r) => ({
  ...r,
  variantIds: JSON.parse(r.variantIds) as string[],
}));

export function addPaper(paper: Paper): void {
  stmts.insertPaper.run(paper.paperId, paper.subject, JSON.stringify(paper.variantIds));
  papers.push(paper);
}

// ─── Centers ───────────────────────────────────────────────────────────────

const SEED_CENTERS = [
  { id: "MH01", name: "St. Xavier's Centre", city: "Mumbai" },
  { id: "MH02", name: "Fergusson Centre", city: "Pune" },
  { id: "DL01", name: "Modern School Centre", city: "Delhi" },
  { id: "KA01", name: "National College Centre", city: "Bengaluru" },
];
for (const c of SEED_CENTERS) stmts.insertCenter.run(c.id, c.name, c.city, null, null, "idle");

export const centers: Center[] = (db.prepare("SELECT * FROM centers").all() as any[]).map((r) => ({
  ...r,
  variant: r.variant ?? null,
  paperId: r.paperId ?? null,
  custody: JSON.parse(r.custody) as CustodyEntry[],
}));

export function updateCenter(id: string, updates: Partial<Pick<Center, "variant" | "paperId" | "status" | "custody">>): void {
  const c = centers.find((x) => x.id === id);
  if (!c) return;
  Object.assign(c, updates);
  stmts.updateCenter.run(c.variant, c.paperId, c.status, JSON.stringify(c.custody), id);
}

// ─── Assignments ───────────────────────────────────────────────────────────

export const assignments = new Map<string, Assignment>(
  (db.prepare("SELECT * FROM assignments").all() as Assignment[]).map((r) => [r.rollNumber, r])
);

export function setAssignment(rollNumber: string, data: Assignment): void {
  stmts.insertAssignment.run(rollNumber, data.centerId, data.paperId, data.variant, data.blockHash);
  assignments.set(rollNumber, data);
}

// ─── Exam config ───────────────────────────────────────────────────────────

const _examStartAtRow = db.prepare("SELECT value FROM exam_config WHERE key = 'startAt'").get() as any;
export const examConfig = { startAt: _examStartAtRow ? Number(_examStartAtRow.value) : null as number | null };

export function setExamStartAt(ts: number): void {
  examConfig.startAt = ts;
  stmts.upsertExamConfig.run("startAt", String(ts));
}

// ─── Flags ─────────────────────────────────────────────────────────────────

export const flags: Flag[] = db.prepare("SELECT * FROM flags ORDER BY id DESC LIMIT 200").all() as Flag[];

export function addFlag(f: Omit<Flag, "id" | "timestamp" | "status" | "decidedBy">): Flag {
  const timestamp = new Date().toISOString();
  const result = stmts.insertFlag.run(timestamp, f.centerId, f.candidate, f.type, f.severity);
  const flag: Flag = { id: result.lastInsertRowid as number, timestamp, status: "open", decidedBy: null, ...f };
  flags.unshift(flag);
  if (flags.length > 200) flags.pop();
  return flag;
}

export function updateFlag(id: number, updates: Partial<Pick<Flag, "status" | "decidedBy">>): void {
  stmts.updateFlag.run(updates.status, updates.decidedBy ?? null, id);
  const flag = flags.find((f) => f.id === id);
  if (flag) Object.assign(flag, updates);
}

// ─── Scripts ───────────────────────────────────────────────────────────────

export const scripts: Script[] = db.prepare("SELECT * FROM scripts").all() as Script[];

export function addScript(s: Script): void {
  stmts.insertScript.run(s.code, s.subject, s.paperId, s.variant, s.status, s.marks ?? null, s.evaluatedBy ?? null);
  scripts.push(s);
}

export function updateScript(code: string, updates: Partial<Pick<Script, "status" | "marks" | "evaluatedBy">>): void {
  const s = scripts.find((x) => x.code === code);
  if (!s) return;
  Object.assign(s, updates);
  stmts.updateScript.run(s.status, s.marks ?? null, s.evaluatedBy ?? null, code);
}

// ─── Live stats ────────────────────────────────────────────────────────────

const _fairnessRow = db.prepare("SELECT value FROM live_stats WHERE key = 'lastFairness'").get() as any;
const _papersRow = db.prepare("SELECT value FROM live_stats WHERE key = 'papersAssembled'").get() as any;

export const liveStats = {
  lastFairness: _fairnessRow ? (JSON.parse(_fairnessRow.value) as number | null) : null,
  papersAssembled: _papersRow ? (JSON.parse(_papersRow.value) as number) : 0,
};

export function updateLiveStats(updates: Partial<{ lastFairness: number | null; papersAssembled: number }>): void {
  if (updates.lastFairness !== undefined) {
    liveStats.lastFairness = updates.lastFairness;
    stmts.upsertStat.run("lastFairness", JSON.stringify(updates.lastFairness));
  }
  if (updates.papersAssembled !== undefined) {
    liveStats.papersAssembled = updates.papersAssembled;
    stmts.upsertStat.run("papersAssembled", JSON.stringify(updates.papersAssembled));
  }
}

// ─── Refresh tokens ────────────────────────────────────────────────────────

export function getRefreshToken(token: string): RefreshRecord | undefined {
  return db.prepare("SELECT * FROM refresh_tokens WHERE token = ?").get(token) as RefreshRecord | undefined;
}

export function setRefreshToken(token: string, record: RefreshRecord): void {
  stmts.setRefreshToken.run(token, record.userId, record.family, record.sid, record.expiresAt);
}

export function deleteRefreshToken(token: string): void {
  stmts.deleteRefreshToken.run(token);
}

// ─── Lockouts ──────────────────────────────────────────────────────────────

export function getLockout(username: string): LockoutRecord | undefined {
  const row = db.prepare("SELECT * FROM lockouts WHERE username = ?").get(username) as any;
  if (!row) return undefined;
  return { fails: row.fails, lockedUntil: row.lockedUntil ?? null };
}

export function setLockout(username: string, record: LockoutRecord): void {
  stmts.upsertLockout.run(username, record.fails, record.lockedUntil ?? null);
}

export function deleteLockout(username: string): void {
  stmts.deleteLockout.run(username);
}

// ─── Audit log ─────────────────────────────────────────────────────────────

export function addAudit(e: Omit<AuditEntry, "id">): void {
  stmts.insertAudit.run(e.timestamp, e.userId ?? null, e.role ?? null, e.ip, e.method, e.path, e.action, e.status);
}

export function getAuditEntries(limit = 100): AuditEntry[] {
  return db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(limit) as AuditEntry[];
}

// ─── Seed bank (first boot only) ───────────────────────────────────────────

if (questions.length === 0) {
  [
    { subject: "Physics", topic: "Work & Energy", text: "State and derive the work-energy theorem for a particle moving under a variable force.", marks: 5, difficulty: "medium" as const },
    { subject: "Physics", topic: "Kinematics", text: "A projectile is launched at 45° with speed 20 m/s. Find its range and maximum height (g = 10 m/s²).", marks: 3, difficulty: "easy" as const },
    { subject: "Physics", topic: "Circuits", text: "Explain Kirchhoff's laws and apply them to find current in a two-loop circuit with EMFs 6V and 12V.", marks: 5, difficulty: "hard" as const },
    { subject: "Mathematics", topic: "Number Theory", text: "Prove that √2 is irrational using contradiction.", marks: 3, difficulty: "easy" as const },
    { subject: "Mathematics", topic: "Calculus", text: "Evaluate ∫ x²·e^x dx using integration by parts.", marks: 5, difficulty: "medium" as const },
    { subject: "Mathematics", topic: "Linear Algebra", text: "Find the eigenvalues and eigenvectors of the matrix [[2,1],[1,2]].", marks: 5, difficulty: "hard" as const },
  ].forEach((q) => addQuestion({ ...q, createdBy: "u-tea-1", status: "approved" }));
}
