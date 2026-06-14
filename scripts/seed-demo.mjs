// ExamShield Demo Seed Script (ESM)
// Run: node scripts/seed-demo.mjs

const BASE = "http://localhost:4000";

async function api(method, path, body, token, csrf) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (csrf)  headers["x-csrf-token"] = csrf;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!res.ok) {
      console.log(`  [${res.status}] ${path} => ${json.error ?? text}`);
      return null;
    }
    return json;
  } catch {
    console.log(`  [${res.status}] ${path} => ${text}`);
    return null;
  }
}

console.log("\n=== ExamShield Demo Seeder ===\n");

// 1. Admin login
process.stdout.write("[1] Admin login... ");
const auth = await api("POST", "/api/auth/login", { username: "admin1", password: "admin123" });
if (!auth) { console.log("FATAL: admin login failed. Is server on :4000?"); process.exit(1); }
const adminToken = auth.accessToken;
const adminCsrf  = auth.csrfToken;
console.log(`OK — ${auth.user.name}`);

// 2. List approved MCQ questions
process.stdout.write("[2] Fetching questions... ");
const qData = await api("GET", "/api/paper-compose/questions", null, adminToken);
const allQ = qData?.questions ?? [];
const mcqQ = allQ.filter(q => q.options && q.options.length === 4);
const physicsQ = mcqQ.filter(q => q.subject === "Physics");
const mathQ = mcqQ.filter(q => q.subject === "Mathematics");
console.log(`${allQ.length} total | ${mcqQ.length} MCQ | ${physicsQ.length} Physics | ${mathQ.length} Math`);

// 3. Paper — create if none exists
process.stdout.write("[3] Checking papers... ");
const paperData = await api("GET", "/api/paper-compose/papers", null, adminToken);
let paperId = paperData?.papers?.length > 0 ? paperData.papers[paperData.papers.length - 1].paperId : null;

if (paperId) {
  console.log(`exists: ${paperId} — skipping`);
} else {
  console.log("none found — creating...");
  const startAt = Date.now() - 30 * 60 * 1000; // 30 min ago

  let result = null;
  if (physicsQ.length >= 6) {
    result = await api("POST", "/api/paper-compose/generate-variants", {
      title: "Physics Board Examination 2026",
      subject: "Physics",
      numVariants: 2,
      questionsPerVariant: 3,
      durationMinutes: 90,
      startAt,
    }, adminToken, adminCsrf);
    if (result) console.log(`  Created ${result.paperId} — variants: ${result.variants.join(", ")}`);
  }

  if (!result && mcqQ.length >= 4) {
    // Fallback: manual finalize with mixed questions
    const qIds = mcqQ.slice(0, 8).map(q => q.id);
    result = await api("POST", "/api/paper-compose/finalize", {
      title: "Science & Math Board Examination 2026",
      subject: "Mixed",
      questionIds: qIds,
      durationMinutes: 90,
      startAt,
    }, adminToken, adminCsrf);
    if (result) console.log(`  Created ${result.paperId} (single-variant fallback)`);
  }

  if (!result) { console.log("  FATAL: no questions available to create a paper"); process.exit(1); }
  paperId = result.paperId;
}

// 4. Distribute to centers
process.stdout.write("[4] Checking assignments... ");
const centerData = await api("GET", "/api/centers", null, adminToken);
const distributed = centerData?.centers?.filter(c => c.status !== "idle") ?? [];

if (distributed.length > 0) {
  console.log(`already distributed to ${distributed.length} centers — skipping`);
} else {
  const dist = await api("POST", "/api/centers/distribute", null, adminToken, adminCsrf);
  if (dist) console.log(`distributed to ${dist.distributed} centers, ${dist.candidates} roll numbers created`);
}

// 5. Force exam LIVE (started 30 min ago, 90 min duration)
process.stdout.write("[5] Scheduling exam live... ");
const schedResult = await api("POST", "/api/centers/schedule", {
  datetime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  durationMinutes: 90,
}, adminToken, adminCsrf);
if (schedResult) {
  const endsAt = new Date(schedResult.examStartAt + schedResult.examDuration);
  console.log(`live — ends at ${endsAt.toLocaleTimeString()}`);
}

// 6. Student login and pre-seed MH01-002 with flags + submission
process.stdout.write("[6] Student login for pre-seeding... ");
const stuAuth = await api("POST", "/api/auth/login", { username: "student1", password: "student123" });
if (!stuAuth) {
  console.log("failed — skipping pre-submission");
} else {
  console.log("OK");
  const sToken = stuAuth.accessToken;
  const sCsrf  = stuAuth.csrfToken;

  // Check if already submitted
  const existSub = await api("GET", "/api/exam/result?roll=MH01-002", null, sToken);
  if (existSub && !existSub.error) {
    console.log("  MH01-002 already submitted — skipping");
  } else {
    process.stdout.write("  Loading paper for MH01-002... ");
    const paper002 = await api("GET", "/api/exam/paper?roll=MH01-002", null, sToken);
    if (!paper002?.questions) {
      console.log("could not load (exam may not be live)");
    } else {
      console.log(`${paper002.questions.length} questions`);

      // Add demo flags
      const flagTypes = ["tab_switch", "tab_switch", "no_face", "face_away", "multiple_faces"];
      for (const type of flagTypes) {
        await api("POST", "/api/exam/flag", { rollNumber: "MH01-002", type }, sToken, sCsrf);
        await new Promise(r => setTimeout(r, 100));
      }
      console.log(`  Added ${flagTypes.length} proctoring flags for MH01-002`);

      // Submit with mixed answers
      const answers = {};
      paper002.questions.forEach((q, i) => {
        if (i % 4 === 3) return; // skip every 4th
        answers[q.id] = i % 3 === 0 ? 2 : 0; // mix of options
      });
      const sub = await api("POST", "/api/exam/submit", { rollNumber: "MH01-002", answers }, sToken, sCsrf);
      if (sub) console.log(`  MH01-002 submitted: ${sub.answered} answered, ${sub.skipped} skipped`);
    }
  }
}

// 7. Also add flags for MH01-001 (to show in proctoring view pre-populated)
process.stdout.write("[7] Adding demo flags for MH01-001... ");
const stuAuth2 = await api("POST", "/api/auth/login", { username: "student1", password: "student123" });
if (stuAuth2) {
  const s2Csrf = stuAuth2.csrfToken;
  await api("POST", "/api/exam/flag", { rollNumber: "MH01-001", type: "tab_switch" }, stuAuth2.accessToken, s2Csrf);
  await api("POST", "/api/exam/flag", { rollNumber: "MH01-001", type: "face_away" }, stuAuth2.accessToken, s2Csrf);
  console.log("added 2 flags");
}

// Done
console.log(`
=== Seed Complete ===

Credentials:
  admin1 / admin123     (Controller of Examinations)
  teacher1 / teacher123 (Prof. Meera Joshi)
  student1 / student123 (Aarav Sharma)

Roll numbers for demo:
  MH01-001  <- USE for live exam demo (NOT submitted yet)
  MH01-002  <- Pre-submitted with 5 flags (use in admin proctoring view)
  MH01-003, MH02-001, MH02-002, MH02-003 — available

App: http://localhost:5173
`);
