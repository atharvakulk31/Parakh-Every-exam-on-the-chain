import bcrypt from "bcryptjs";
import { encrypt, decrypt } from "./crypto.js";
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
  options?: string[] | null;
  correctAnswer?: number | null;
  plainText?: string | null;
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
  questionIds?: string[] | null;
  variantQuestionIds?: Record<string, string[]> | null;
  title?: string | null;
  paperHash?: string | null;
  finalizedBy?: string | null;
  finalizedAt?: string | null;
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
  insertQuestion: db.prepare("INSERT OR IGNORE INTO questions (id, subject, topic, language, status, encryptedText, marks, difficulty, createdBy, createdAt, options, correctAnswer, plainText) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"),
  approveQuestion: db.prepare("UPDATE questions SET status = 'approved' WHERE id = ?"),
  insertPaper: db.prepare("INSERT OR REPLACE INTO papers (paperId, subject, variantIds, questionIds, title, paperHash, finalizedBy, finalizedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
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

export const questions: Question[] = (db.prepare("SELECT * FROM questions ORDER BY createdAt").all() as any[]).map((r) => ({
  ...r,
  options: r.options ? JSON.parse(r.options) as string[] : null,
  correctAnswer: r.correctAnswer ?? null,
  plainText: r.plainText ?? null,
}));

let qSeq = questions.reduce((max, q) => Math.max(max, parseInt(q.id.replace("Q-", ""), 10) || 0), 0);

// ─── Answer key vault (separate encrypted store) ───────────────────────────

const _akInsert = db.prepare("INSERT OR REPLACE INTO answer_keys (questionId, encryptedAnswer, createdAt) VALUES (?, ?, ?)");
const _akGet = db.prepare("SELECT encryptedAnswer FROM answer_keys WHERE questionId = ?");

function _storeAnswerKey(questionId: string, correctAnswer: number, createdAt: string): void {
  _akInsert.run(questionId, encrypt(String(correctAnswer)), createdAt);
}

export function getAnswerKey(questionId: string): number | null {
  const row = _akGet.get(questionId) as { encryptedAnswer: string } | undefined;
  if (!row) return null;
  try { return parseInt(decrypt(row.encryptedAnswer), 10); } catch { return null; }
}

export function addQuestion(q: {
  subject: string; text: string; marks: number; difficulty: Question["difficulty"];
  createdBy: string; topic?: string; language?: string; status?: Question["status"];
  options?: string[]; correctAnswer?: number;
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
    options: q.options ?? null,
    correctAnswer: q.correctAnswer ?? null,
    plainText: q.text,
  };
  stmts.insertQuestion.run(
    question.id, question.subject, question.topic, question.language,
    question.status, question.encryptedText, question.marks, question.difficulty,
    question.createdBy, question.createdAt,
    question.options ? JSON.stringify(question.options) : null,
    question.correctAnswer ?? null,
    question.plainText ?? null,
  );
  // Mirror correct answer to separate encrypted vault
  if (q.correctAnswer != null) {
    _storeAnswerKey(question.id, q.correctAnswer, question.createdAt);
  }
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
  questionIds: r.questionIds ? JSON.parse(r.questionIds) as string[] : null,
  variantQuestionIds: r.variantQuestionIds ? JSON.parse(r.variantQuestionIds) as Record<string, string[]> : null,
  title: r.title ?? null,
  paperHash: r.paperHash ?? null,
  finalizedBy: r.finalizedBy ?? null,
  finalizedAt: r.finalizedAt ?? null,
}));

export function addPaper(paper: Paper): void {
  stmts.insertPaper.run(
    paper.paperId, paper.subject, JSON.stringify(paper.variantIds),
    paper.questionIds ? JSON.stringify(paper.questionIds) : null,
    paper.title ?? null, paper.paperHash ?? null,
    paper.finalizedBy ?? null, paper.finalizedAt ?? null,
  );
  if (paper.variantQuestionIds) {
    db.prepare("UPDATE papers SET variantQuestionIds = ? WHERE paperId = ?")
      .run(JSON.stringify(paper.variantQuestionIds), paper.paperId);
  }
  papers.push(paper);
}

export function updatePaper(paperId: string, updates: Partial<Pick<Paper, "paperHash" | "finalizedBy" | "finalizedAt" | "questionIds" | "title">>): void {
  const p = papers.find((x) => x.paperId === paperId);
  if (!p) return;
  Object.assign(p, updates);
  db.prepare("UPDATE papers SET paperHash=?, finalizedBy=?, finalizedAt=?, questionIds=?, title=? WHERE paperId=?")
    .run(p.paperHash ?? null, p.finalizedBy ?? null, p.finalizedAt ?? null,
         p.questionIds ? JSON.stringify(p.questionIds) : null, p.title ?? null, paperId);
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
const _examDurationRow = db.prepare("SELECT value FROM exam_config WHERE key = 'duration'").get() as any;
const _examStateRow = db.prepare("SELECT value FROM exam_config WHERE key = 'examState'").get() as any;
export const examConfig: {
  startAt: number | null;
  duration: number;
  examState: "active" | "ended" | "evaluated";
} = {
  startAt: _examStartAtRow ? Number(_examStartAtRow.value) : null,
  duration: _examDurationRow ? Number(_examDurationRow.value) : 90 * 60 * 1000,
  examState: (_examStateRow?.value as "active" | "ended" | "evaluated") ?? "active",
};

// Demo: if the exam window has already expired, roll startAt forward so judges always see a live exam
{
  const start = examConfig.startAt;
  if (start && Date.now() > start + examConfig.duration) {
    const newStart = Date.now() - 30 * 60_000; // 30 min into a fresh 90-min window
    examConfig.startAt = newStart;
    db.prepare("UPDATE exam_config SET value = ? WHERE key = 'startAt'").run(String(newStart));
  }
}

export function setExamStartAt(ts: number): void {
  examConfig.startAt = ts;
  stmts.upsertExamConfig.run("startAt", String(ts));
}

export function setExamDuration(ms: number): void {
  examConfig.duration = ms;
  stmts.upsertExamConfig.run("duration", String(ms));
}

export function setExamState(state: "active" | "ended" | "evaluated"): void {
  examConfig.examState = state;
  stmts.upsertExamConfig.run("examState", state);
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

// ─── Exam submissions ──────────────────────────────────────────────────────

export interface ExamSubmission {
  rollNumber: string;
  answers: Record<string, number>;
  score: number;   // -1 = ungraded (pending admin unlock)
  total: number;
  submittedAt: string;
  graded: number;  // 0 = pending, 1 = graded
}

export function getSubmission(rollNumber: string): ExamSubmission | undefined {
  const row = db.prepare("SELECT * FROM exam_submissions WHERE rollNumber = ?").get(rollNumber) as any;
  if (!row) return undefined;
  return { ...row, answers: JSON.parse(row.answers) as Record<string, number> };
}

export function getAllSubmissions(): ExamSubmission[] {
  return (db.prepare("SELECT * FROM exam_submissions ORDER BY submittedAt").all() as any[])
    .map((r) => ({ ...r, answers: JSON.parse(r.answers) as Record<string, number> }));
}

export function addSubmission(s: Omit<ExamSubmission, "graded">): void {
  db.prepare("INSERT OR IGNORE INTO exam_submissions (rollNumber, answers, score, total, submittedAt, graded) VALUES (?, ?, ?, ?, ?, 0)")
    .run(s.rollNumber, JSON.stringify(s.answers), s.score, s.total, s.submittedAt);
}

export function gradeSubmission(rollNumber: string, score: number, total: number): void {
  db.prepare("UPDATE exam_submissions SET score = ?, total = ?, graded = 1 WHERE rollNumber = ?").run(score, total, rollNumber);
}

export function deleteQuestion(id: string): void {
  db.prepare("DELETE FROM questions WHERE id = ?").run(id);
  db.prepare("DELETE FROM answer_keys WHERE questionId = ?").run(id);
  const idx = questions.findIndex((q) => q.id === id);
  if (idx >= 0) questions.splice(idx, 1);
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

// MCQ questions — seeded once, used for live student exam
if (!questions.some((q) => q.options && q.options.length > 0)) {
  ([
    { subject: "Physics", topic: "Laws of Motion", text: "Newton's Second Law states that net force on a body equals:", options: ["mass × velocity", "mass × acceleration", "mass × distance", "mass / time"], correctAnswer: 1, marks: 1, difficulty: "easy" as const },
    { subject: "Physics", topic: "Electricity", text: "The SI unit of electric charge is:", options: ["Ampere", "Volt", "Coulomb", "Farad"], correctAnswer: 2, marks: 1, difficulty: "easy" as const },
    { subject: "Physics", topic: "Kinematics", text: "Which of the following is a vector quantity?", options: ["Speed", "Temperature", "Displacement", "Energy"], correctAnswer: 2, marks: 1, difficulty: "easy" as const },
    { subject: "Physics", topic: "Wave Optics", text: "Bending of light around the edges of an obstacle is called:", options: ["Reflection", "Refraction", "Diffraction", "Polarisation"], correctAnswer: 2, marks: 1, difficulty: "medium" as const },
    { subject: "Physics", topic: "Circuits", text: "In a parallel circuit, the voltage across each branch is:", options: ["Different for each branch", "Same across all branches", "Zero", "Sum of all EMFs"], correctAnswer: 1, marks: 1, difficulty: "medium" as const },
    { subject: "Physics", topic: "Thermodynamics", text: "The first law of thermodynamics is based on conservation of:", options: ["Momentum", "Charge", "Energy", "Mass"], correctAnswer: 2, marks: 1, difficulty: "medium" as const },
    { subject: "Mathematics", topic: "Calculus", text: "The derivative of sin(x) with respect to x is:", options: ["cos(x)", "−cos(x)", "tan(x)", "−sin(x)"], correctAnswer: 0, marks: 1, difficulty: "easy" as const },
    { subject: "Mathematics", topic: "Logarithms", text: "What is the value of log₁₀(1000)?", options: ["2", "3", "4", "10"], correctAnswer: 1, marks: 1, difficulty: "easy" as const },
    { subject: "Mathematics", topic: "Geometry", text: "The sum of interior angles of a triangle is:", options: ["90°", "180°", "270°", "360°"], correctAnswer: 1, marks: 1, difficulty: "easy" as const },
    { subject: "Mathematics", topic: "Number Theory", text: "Which of the following is an irrational number?", options: ["0.5", "√4", "√2", "4/3"], correctAnswer: 2, marks: 1, difficulty: "medium" as const },
    { subject: "Mathematics", topic: "Calculus", text: "If f(x) = x³, then f′(x) equals:", options: ["x²", "3x²", "3x", "x³"], correctAnswer: 1, marks: 1, difficulty: "medium" as const },
    { subject: "Chemistry", topic: "Atomic Structure", text: "The atomic number of Carbon is:", options: ["4", "6", "8", "12"], correctAnswer: 1, marks: 1, difficulty: "easy" as const },
  ]).forEach((q) => addQuestion({ ...q, createdBy: "u-tea-1", status: "approved" }));
}

// Backfill answer_keys for any MCQ questions missing from vault
{
  const existing = new Set(
    (db.prepare("SELECT questionId FROM answer_keys").all() as { questionId: string }[]).map((r) => r.questionId)
  );
  for (const q of questions) {
    if (q.correctAnswer != null && !existing.has(q.id)) {
      _storeAnswerKey(q.id, q.correctAnswer, q.createdAt);
    }
  }
}
