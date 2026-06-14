##########################################################################
# ExamShield Demo Seed Script
# Populates: paper, variants, assignments, live exam, one pre-submission,
# and demo flags — leaves MH01-001 clean for live demo recording.
##########################################################################

$BASE = "http://localhost:4000"
$ErrorActionPreference = "Stop"

function Invoke-API {
    param($Method, $Path, $Body = $null, $Token = $null)
    $headers = @{ "Content-Type" = "application/json" }
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    $params = @{ Method = $Method; Uri = "$BASE$Path"; Headers = $headers }
    if ($Body) { $params["Body"] = ($Body | ConvertTo-Json -Depth 10) }
    try {
        Invoke-RestMethod @params
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $msg    = $_.ErrorDetails.Message
        Write-Host "  [ERROR $status] $Path — $msg" -ForegroundColor Red
        return $null
    }
}

Write-Host "`n=== ExamShield Demo Seeder ===" -ForegroundColor Cyan

# ── 1. Admin login ────────────────────────────────────────────────────
Write-Host "`n[1] Admin login..." -ForegroundColor Yellow
$auth = Invoke-API POST "/api/auth/login" @{ username = "admin1"; password = "admin123" }
if (-not $auth) { Write-Host "FATAL: admin login failed. Is the server running on :4000?" -ForegroundColor Red; exit 1 }
$adminToken = $auth.accessToken
Write-Host "    Logged in as $($auth.user.name)" -ForegroundColor Green

# ── 2. List approved MCQ questions ───────────────────────────────────
Write-Host "`n[2] Fetching approved questions..." -ForegroundColor Yellow
$qData = Invoke-API GET "/api/paper-compose/questions" -Token $adminToken
$allQ  = $qData.questions
$mcqQ  = $allQ | Where-Object { $_.options -and $_.options.Count -eq 4 }
Write-Host "    Total approved: $($allQ.Count) | MCQ (4-option): $($mcqQ.Count)"

$physicsQ = $mcqQ | Where-Object { $_.subject -eq "Physics" }
$mathQ    = $mcqQ | Where-Object { $_.subject -eq "Mathematics" }
Write-Host "    Physics MCQ: $($physicsQ.Count) | Math MCQ: $($mathQ.Count)"

# ── 3. Check if paper already exists ─────────────────────────────────
Write-Host "`n[3] Checking existing papers..." -ForegroundColor Yellow
$paperData = Invoke-API GET "/api/paper-compose/papers" -Token $adminToken
if ($paperData.papers.Count -gt 0) {
    Write-Host "    Paper already exists: $($paperData.papers[-1].paperId) — skipping paper creation" -ForegroundColor Cyan
    $paperId = $paperData.papers[-1].paperId
} else {
    # Need at least 2 variants × 3 questions each = 6 total per subject
    # Use Physics if enough, else fall back to manual compose with all MCQs
    if ($physicsQ.Count -ge 6) {
        Write-Host "    Generating 2-variant Physics paper, 3 questions per variant..." -ForegroundColor Yellow
        $startAt = [DateTimeOffset]::UtcNow.AddMinutes(-30).ToUnixTimeMilliseconds()
        $varResult = Invoke-API POST "/api/paper-compose/generate-variants" @{
            title              = "Physics Board Examination 2026"
            subject            = "Physics"
            numVariants        = 2
            questionsPerVariant = 3
            durationMinutes    = 90
            startAt            = $startAt
        } -Token $adminToken

        if ($varResult) {
            Write-Host "    Paper $($varResult.paperId) created. Variants: $($varResult.variants -join ', ')" -ForegroundColor Green
            Write-Host "    Paper Hash: $($varResult.paperHash.Substring(0,24))..."
            $paperId = $varResult.paperId
        }
    } else {
        # Fallback: compose with all available MCQs (any subject)
        Write-Host "    Not enough Physics MCQs — composing single-variant paper with all MCQs..." -ForegroundColor Yellow
        $qIds    = ($mcqQ | Select-Object -First 8).id
        $startAt = [DateTimeOffset]::UtcNow.AddMinutes(-30).ToUnixTimeMilliseconds()
        $finResult = Invoke-API POST "/api/paper-compose/finalize" @{
            title           = "Science & Math Board Examination 2026"
            subject         = "Mixed"
            questionIds     = @($qIds)
            durationMinutes = 90
            startAt         = $startAt
        } -Token $adminToken
        if ($finResult) {
            Write-Host "    Paper $($finResult.paperId) finalized." -ForegroundColor Green
            $paperId = $finResult.paperId
        }
    }
}

# ── 4. Check assignments — distribute if none ─────────────────────────
Write-Host "`n[4] Setting up center assignments..." -ForegroundColor Yellow
$centerData = Invoke-API GET "/api/centers" -Token $adminToken

if ($centerData.centers -and ($centerData.centers | Where-Object { $_.status -ne "idle" }).Count -gt 0) {
    Write-Host "    Centers already distributed — skipping" -ForegroundColor Cyan
} else {
    $distResult = Invoke-API POST "/api/centers/distribute" -Token $adminToken
    if ($distResult) {
        Write-Host "    Distributed to $($distResult.distributed) centers, $($distResult.candidates) candidates assigned" -ForegroundColor Green
        Write-Host "    Demo rolls: MH01-001, MH01-002, MH01-003, MH02-001..."
    }
}

# ── 5. Schedule exam LIVE right now ──────────────────────────────────
Write-Host "`n[5] Ensuring exam is live..." -ForegroundColor Yellow
$schedResult = Invoke-API POST "/api/centers/schedule" @{
    datetime        = [DateTimeOffset]::UtcNow.AddMinutes(-30).ToString("yyyy-MM-ddTHH:mm:ssZ")
    durationMinutes = 90
} -Token $adminToken
if ($schedResult) {
    $examStart = [DateTimeOffset]::FromUnixTimeMilliseconds($schedResult.examStartAt).LocalDateTime
    Write-Host "    Exam started at: $examStart -- 30 min ago" -ForegroundColor Green
    Write-Host "    Ends at: $([DateTimeOffset]::FromUnixTimeMilliseconds($schedResult.examStartAt + $schedResult.examDuration).LocalDateTime)"
}

# ── 6. Add pre-existing flags (from MH01-002) ─────────────────────────
Write-Host "`n[6] Seeding demo proctoring flags..." -ForegroundColor Yellow
$studentAuth = Invoke-API POST "/api/auth/login" @{ username = "student1"; password = "student123" }
if ($studentAuth) {
    $sToken = $studentAuth.accessToken

    # Check if MH01-002 already submitted
    $existingSub = Invoke-API GET "/api/exam/result?roll=MH01-002" -Token $sToken
    if ($existingSub -and $existingSub.submittedAt) {
        Write-Host "    MH01-002 already submitted — skipping pre-submission" -ForegroundColor Cyan
    } else {
        # Get paper for MH01-002
        $paper002 = Invoke-API GET "/api/exam/paper?roll=MH01-002" -Token $sToken
        if ($paper002 -and $paper002.questions) {
            # Add some flags first
            $flagTypes = @("tab_switch", "no_face", "face_away", "tab_switch")
            foreach ($ft in $flagTypes) {
                Start-Sleep -Milliseconds 200
                Invoke-API POST "/api/exam/flag" @{ rollNumber = "MH01-002"; type = $ft } -Token $sToken | Out-Null
            }
            Write-Host "    Added $($flagTypes.Count) proctoring flags for MH01-002" -ForegroundColor Green

            # Submit with mixed answers (some correct, some wrong)
            $answers = @{}
            $qs = $paper002.questions
            for ($i = 0; $i -lt $qs.Count; $i++) {
                if ($i % 3 -eq 0) {
                    # skip every 3rd
                } elseif ($i % 2 -eq 0) {
                    $answers[$qs[$i].id] = 0   # likely wrong (first option)
                } else {
                    $answers[$qs[$i].id] = 2   # mixed
                }
            }
            $subResult = Invoke-API POST "/api/exam/submit" @{
                rollNumber = "MH01-002"
                answers    = $answers
            } -Token $sToken
            if ($subResult) {
                Write-Host "    MH01-002 submitted: $($subResult.answered) answered, $($subResult.skipped) skipped" -ForegroundColor Green
            }
        } else {
            Write-Host "    Could not load paper for MH01-002 (exam may not be live yet)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "    Student login failed — skipping pre-submission" -ForegroundColor Yellow
}

# ── Summary ───────────────────────────────────────────────────────────
Write-Host "`n=== Seed Complete ===" -ForegroundColor Cyan
Write-Host @"

Demo credentials:
  Admin  : admin1 / admin123
  Teacher: teacher1 / teacher123
  Student: student1 / student123

Demo roll numbers:
  MH01-001  <- USE THIS for live demo (clean, not submitted)
  MH01-002  <- pre-submitted with flags (show in admin proctoring view)
  MH01-003, MH02-001, MH02-002... available too

App: http://localhost:5173
"@ -ForegroundColor White
