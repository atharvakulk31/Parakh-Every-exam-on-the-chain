<div align="center">

# 🛡️ Parakh — Tamper-Proof Exam Platform

**Built for India's national board examinations. Zero paper leaks. Zero tampering. Cryptographically verified.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://reactjs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express)](https://expressjs.com)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?style=flat-square&logo=sqlite)](https://sqlite.org)
[![Claude AI](https://img.shields.io/badge/Claude-AI%20Powered-D97757?style=flat-square)](https://anthropic.com)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](LICENSE)

</div>

---

## 🔥 The Problem

Every year, **millions of students** sit India's JEE, NEET, and board exams — and every year, **paper leaks destroy lives**. A single WhatsApp forward wrecks the fairness of an exam that determines a student's entire future.

Parakh eliminates leaks **by design**: the answer key never exists in plaintext until the moment the admin unlocks it — long after every student has submitted.

---

## ✨ What Makes Parakh Different

| Feature | Legacy Systems | **Parakh** |
|---|---|---|
| Answer key storage | Plaintext / printed | AES-256-GCM encrypted vault |
| Paper distribution | Physical / untracked | SHA-256 hash chain + blockchain audit |
| Identity verification | Manual ID check | JWT sessions + browser face proctoring |
| Result verification | Paper certificate | QR code → public blockchain lookup |
| Variant assignment | Sequential (A→B→C) | Fisher-Yates shuffle (no predictable pattern) |
| Tamper detection | None | Hash chain breaks → detected instantly |
| Question screening | Manual | Claude AI pre-screens quality & difficulty |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PARAKH PLATFORM                          │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────────────┐  │
│  │  Teacher │    │  Admin   │    │        Student           │  │
│  │  Portal  │    │  Portal  │    │        Portal            │  │
│  └────┬─────┘    └────┬─────┘    └────────────┬─────────────┘  │
│       │               │                        │                │
│       └───────────────┴────────────────────────┘                │
│                            │                                    │
│                    ┌───────▼────────┐                           │
│                    │  React 18 SPA  │                           │
│                    │  Vite + TS     │  ← port 5173              │
│                    │  Tailwind v4   │                           │
│                    └───────┬────────┘                           │
│                            │  /api/* proxied                    │
│                    ┌───────▼────────┐                           │
│                    │ Express Server │  ← port 4000              │
│                    │  JWT + CSRF    │                           │
│                    │  Rate Limiting │                           │
│                    └───┬───────┬────┘                           │
│                        │       │                                │
│             ┌──────────▼──┐  ┌─▼───────────────┐              │
│             │  SQLite DB   │  │  In-Memory Store │              │
│             │  (persists)  │  │  activeSessions  │              │
│             │              │  │  hash chain      │              │
│             │  questions   │  │  assignments     │              │
│             │  submissions │  │  papers/variants │              │
│             │  answer_keys │  └──────────────────┘              │
│             │  refresh_tok │                                    │
│             └──────────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 6-Stage Exam Lifecycle

Parakh enforces a **strict one-way state machine**. Each stage unlocks the next. No stage can be skipped or reversed.

```
  STAGE 1              STAGE 2              STAGE 3
┌────────────┐       ┌────────────┐       ┌────────────┐
│  Question  │       │   Paper    │       │   Center   │
│   Bank     │──────▶│  Assembly  │──────▶│Distribution│
│            │       │            │       │            │
│ • Teachers │       │ • Variants │       │ • Roll nos │
│   submit Q │       │   A/B/C/D  │       │   assigned │
│ • Claude   │       │ • Fisher-  │       │ • Written  │
│   screens  │       │   Yates    │       │   to chain │
│ • Admin    │       │   shuffle  │       │            │
│   approves │       │ • SHA-256  │       │            │
│            │       │   seal     │       │            │
└────────────┘       └────────────┘       └────────────┘
                                                │
                                                ▼
  STAGE 6              STAGE 5              STAGE 4
┌────────────┐       ┌────────────┐       ┌────────────┐
│   Public   │       │ Evaluation │       │ Live Exam  │
│Verification│◀──────│            │◀──────│            │
│            │       │ • Admin    │       │ • Encrypted│
│ • QR scan  │       │   unlocks  │       │   vault    │
│ • Chain    │       │   key      │       │ • Face     │
│   verified │       │ • Auto-    │       │   proctor  │
│ • Anyone   │       │   grade    │       │ • Tab      │
│   can check│       │   all subs │       │   detect   │
│            │       │ • Results  │       │ • 90 min   │
│            │       │   released │       │   timer    │
└────────────┘       └────────────┘       └────────────┘
```

---

## 🔐 Security Architecture

### Answer Key Vault — Zero Plaintext at Rest

```
 Teacher submits answer        Admin unlocks post-exam
         │                              │
         ▼                              ▼
  AES-256-GCM encrypt           AES-256-GCM decrypt
  (random IV per entry)         (key derived at runtime)
         │                              │
         ▼                              ▼
  Ciphertext in SQLite          Grade all submissions
  answer_keys table             atomically
         │
    [EXAM RUNS]
         │
   Plaintext NEVER
   leaves the vault
   during the exam
```

### SHA-256 Hash Chain

Every critical event appends an immutable block. Tampering any record breaks all subsequent hashes — detectable in O(n).

```
  Block #0           Block #1           Block #2           Block #3
┌───────────┐      ┌───────────┐      ┌───────────┐      ┌───────────┐
│  GENESIS  │      │PAPER_SEAL │      │ASSIGNMENT │      │ASSIGNMENT │
│           │      │           │      │           │      │           │
│prev: 0000 │─────▶│prev: a1b2 │─────▶│prev: c3d4 │─────▶│prev: e5f6 │
│hash: a1b2 │      │hash: c3d4 │      │hash: e5f6 │      │hash: 7890 │
└───────────┘      └───────────┘      └───────────┘      └───────────┘

  Alter Block #1 → Block #2 hash breaks → Block #3 hash breaks → ...
  → /verify endpoint detects instantly → shows "TAMPERING DETECTED at block #1"
```

### Authentication & Session Security

```
 POST /api/auth/login
         │
  bcrypt.compareSync()
         │
         ▼
  issueTokens()
  ├── Access JWT  (4h TTL, contains userId + sessionId)
  ├── Refresh token (7d TTL, stored in SQLite)
  └── CSRF token  (HMAC-SHA256 of userId + sessionId)
         │
         ▼
  activeSessions.set(userId, sessionId)
  (one active session per user — new login kills old)
         │
  Every request:
  ├── Verify JWT signature
  ├── Check activeSessions[userId] === jwt.sid
  └── Verify X-CSRF-Token header (all mutations)
```

---

## 🎭 Face Proctoring — Zero Cloud, 100% Browser ML

```
 Webcam stream (MediaDevices API)
          │
          ▼  every 3 seconds
 @vladmandic/face-api
 TinyFaceDetector + FaceLandmark68TinyNet
 (models loaded from CDN, run in browser)
          │
    ┌─────┴──────────────────────────┐
    │                                │
    ▼                                ▼
  Face count                   Gaze analysis
    │                          (68 landmarks)
    ├─ 0 faces × 2 ──▶ no_face     │
    └─ 2+ faces ──▶ multiple_faces  │
                               landmarks[36] = left eye
                               landmarks[45] = right eye
                               landmarks[30] = nose tip
                                    │
                               asymmetry ratio > 0.35
                                    │
                                    ▼
                               face_away flag
          │
          ▼
 POST /api/exam/flag  { type, rollNumber, timestamp }
          │
          ▼
 Admin Proctoring Dashboard
 (flag timeline per student)
```

**Proctoring flags:** `no_face` · `multiple_faces` · `face_away` · `tab_switch`

**Privacy:** No video is ever uploaded. Detection happens entirely in the student's browser.

---

## 📱 QR Tamper-Proof Marksheet

```
 Student receives marksheet
           │
           ▼
     Scan QR code
   (printed on result)
           │
           ▼
  https://parakh.app/verify
      ?roll=MH01-001
           │
           ▼
   POST /api/verify
   { rollNumber: "MH01-001" }
           │
      ┌────┴─────┐
      │          │
      ▼          ▼
  Find roll    Verify entire
  in chain     SHA-256 chain
      │          │
      └────┬─────┘
           │
    ┌──────┴───────┐
    │              │
    ▼              ▼
 ✅ VERIFIED    ❌ TAMPERING
 Roll found,   DETECTED at
 chain intact  block #N
```

The verification endpoint is fully **public** — no login required. Anyone — student, parent, employer, university — can verify a result.

---

## 🛠️ Tech Stack

### Frontend
| Library | Version | Purpose |
|---|---|---|
| React | 18.3 | UI framework |
| TypeScript | 5.7 | Type safety |
| Vite | 6.0 | Build tool + dev server proxy |
| Tailwind CSS | 4.0 | Utility-first styling |
| React Router | 6.28 | SPA routing + role guards |
| Recharts | 3.8 | Score analytics charts |
| Lucide React | 1.17 | Icon system |
| `@vladmandic/face-api` | 1.7 | Browser-side face detection ML |

### Backend
| Library | Version | Purpose |
|---|---|---|
| Express | 4.21 | HTTP server |
| better-sqlite3 | 12.10 | Embedded SQLite (sync, fast) |
| jsonwebtoken | 9.0 | JWT access + refresh tokens |
| bcryptjs | 2.4 | Password hashing |
| Node `crypto` | built-in | AES-256-GCM, SHA-256, UUID |
| qrcode | 1.5 | SVG QR code generation |
| `@anthropic-ai/sdk` | 0.104 | Claude AI question screening |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### 1. Install & Run

```bash
git clone <repo-url>
cd parakh
npm install
npm run dev
```

| Service | URL |
|---|---|
| App (React SPA) | http://localhost:5173 |
| API Server | http://localhost:4000 |

### 2. Seed Demo Data

```bash
node scripts/seed-demo.mjs
```

Creates a Physics paper, assigns roll numbers to 2 exam centres, sets exam live, and pre-submits MH01-002 with proctoring flags.

### 3. (Optional) Set Anthropic Key for AI Question Screening

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 🔑 Demo Credentials

| Role | Username | Password | Description |
|---|---|---|---|
| **Admin** | `admin1` | `admin123` | Controller of Examinations |
| **Teacher** | `teacher1` | `teacher123` | Prof. Meera Joshi |
| **Student** | `student1` | `student123` | Aarav Sharma |

### Demo Roll Numbers

```
MH01-001  ←  Live exam demo (clean, not yet submitted)
MH01-002  ←  Pre-submitted with 5 proctoring flags
MH01-003, MH02-001, MH02-002, MH02-003  ←  Available
```

---

## 📡 API Reference

### Auth — `/api/auth`
| Method | Path | Description |
|---|---|---|
| POST | `/login` | Login → access JWT + refresh token + CSRF |
| POST | `/refresh` | Rotate tokens silently |

### Questions — `/api/questions`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Admin/Teacher | List all questions |
| POST | `/` | Teacher | Submit + Claude AI screen |
| PATCH | `/:id/approve` | Admin | Approve for paper use |

### Paper Compose — `/api/paper-compose`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/generate-variants` | Admin | Fisher-Yates → variants A/B/C/D |
| POST | `/finalize` | Admin | Lock + SHA-256 seal |

### Centers — `/api/centers`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Admin | Centre list + status |
| POST | `/distribute` | Admin | Assign rolls, write to chain |
| POST | `/schedule` | Admin | Set exam start |

### Live Exam — `/api/exam`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/paper?roll=X` | Student | Decrypt + serve variant paper |
| POST | `/submit` | Student | Store encrypted answers |
| POST | `/flag` | Student | Record proctoring event |
| GET | `/detailed-result?roll=X` | Student | Per-question result breakdown |

### Evaluation — `/api/evaluation`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/unlock` | Admin | Upload key → auto-grade all |
| GET | `/results` | Admin | All graded results |

### Verification — `/api/verify`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | **Public** | Full hash chain + block ledger |
| POST | `/` | **Public** | Verify a roll number |
| GET | `/qr?roll=X` | **Public** | SVG QR code for marksheet |

---

## 🧩 Project Structure

```
parakh/
├── server/
│   ├── index.ts           # Express app, CORS, routes
│   ├── auth.ts            # JWT, bcrypt, sessions, CSRF
│   ├── crypto.ts          # AES-256-GCM, SHA-256, hash chain
│   ├── store.ts           # SQLite schema + all data access
│   ├── security.ts        # Rate limiting, CSRF middleware
│   ├── seed.ts            # Seed users + question bank
│   └── routes/
│       ├── questions.ts   # Question CRUD + approval
│       ├── paperCompose.ts  # Variant generation + sealing
│       ├── centers.ts     # Centre mgmt + distribution
│       ├── exam.ts        # Live exam: paper, submit, flag
│       ├── evaluation.ts  # Answer key unlock + grading
│       ├── proctoring.ts  # Admin proctoring dashboard
│       ├── verify.ts      # Public verification + QR
│       └── report.ts      # Audit log
│
├── src/
│   ├── App.tsx            # Route tree + role guards
│   ├── lib/
│   │   ├── api.ts         # Fetch wrapper + auto token refresh
│   │   └── auth.tsx       # Auth context + RequireRole
│   ├── components/
│   │   ├── AppShell.tsx   # Layout + nav
│   │   ├── Sidebar.tsx    # Role-aware sidebar
│   │   └── FaceProctor.tsx  # Collapsible PIP webcam
│   └── pages/
│       ├── LoginPage.tsx
│       ├── Dashboard.tsx
│       ├── QuestionBank.tsx    # Stage 1
│       ├── Assembly.tsx        # Stage 2
│       ├── Centers.tsx         # Stage 3
│       ├── ExamPage.tsx        # Stage 4 (student)
│       ├── Proctoring.tsx      # Stage 4 (admin view)
│       ├── Evaluation.tsx      # Stage 5
│       ├── StudentResults.tsx  # Stage 5 (student)
│       └── Verification.tsx    # Stage 6
│
├── scripts/
│   └── seed-demo.mjs      # Demo data seeder
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 🔒 Design Decisions

### Why SQLite instead of PostgreSQL?
Parakh is designed to run **air-gapped** in exam centres with unreliable internet. SQLite needs zero server setup, writes atomically, and survives power cuts with WAL mode. Each centre runs its own instance; sync to HQ happens only at designated windows.

### Why in-memory hash chain instead of an external blockchain?
Real blockchains (Ethereum, etc.) require internet, gas fees, and introduce latency. Our SHA-256 chain gives identical tamper-evidence with zero dependencies and sub-millisecond verification. The entire algorithm is 15 lines of pure Node.js that any auditor can read and run.

### Why AES-256-GCM for answer keys?
The NEET 2024 leak happened because answer keys existed in plaintext on shared drives. In Parakh, the key material is derived at runtime and the ciphertext reveals nothing. Even full database read access does not expose answers until the admin explicitly unlocks post-exam.

### Why browser-side face detection?
Uploading live video to a cloud service creates privacy risks and requires internet. `@vladmandic/face-api` runs TinyFaceDetector in WebAssembly inside the student's browser — no video frame ever leaves the device.

---

## 🎯 Hackathon Highlights

- **AI-powered question screening** — Claude Sonnet evaluates teacher-submitted MCQs for quality, ambiguity, and difficulty before admin approval
- **Browser ML** — face detection runs 100% client-side via TinyFaceDetector + FaceLandmark68TinyNet, zero cloud, zero privacy concern
- **Cryptographic integrity end-to-end** — AES-256-GCM vault + SHA-256 hash chain — every feature has a security primitive behind it
- **Zero plaintext paper path** — from question submission to result verification, nothing sensitive ever sits unencrypted
- **Multi-role UX** — three completely different interfaces (Teacher / Admin / Student) in a single SPA with compile-time route guards
- **Public verifiability** — anyone can verify any result without an account — scan a QR and see the blockchain proof in seconds

---

## 📜 License

MIT — see [LICENSE](LICENSE)

---

<div align="center">

**Built with ❤️ for India's 30 million exam students**

*Parakh (परख) — Hindi for "to evaluate with integrity"*

</div>
