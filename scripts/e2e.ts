// End-to-end drive of the real HTTP API against a running server.
//
//   npm run build && QUESTLEARN_E2E=1 PORT=3111 npm start
//   npx tsx scripts/e2e.ts http://localhost:3111
//
// To play deliberately well or badly it uses /api/dev/peek, which only exists
// when QUESTLEARN_E2E=1. The normal API never reveals an answer before you
// commit to one — the suite asserts that too.

const BASE = process.argv[2] ?? "http://localhost:3111";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// --- a cookie jar, since student identity rides on a cookie ---
class Session {
  private cookies = new Map<string, string>();

  async req(method: string, url: string, body?: unknown): Promise<{ status: number; json: any }> {
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(this.cookies.size > 0
          ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const ix = pair.indexOf("=");
      this.cookies.set(pair.slice(0, ix).trim(), pair.slice(ix + 1).trim());
    }
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  }
}

/** Ask the server which option is correct (test-only endpoint). */
async function peek(session: Session): Promise<number> {
  const res = await session.req("GET", "/api/dev/peek");
  if (res.status === 404) {
    throw new Error("/api/dev/peek is disabled — start the server with QUESTLEARN_E2E=1");
  }
  if (res.status !== 200 || typeof res.json?.answerIndex !== "number") {
    throw new Error(`peek failed: ${res.status} ${JSON.stringify(res.json)}`);
  }
  return res.json.answerIndex;
}


/**
 * A stage teaches before it asks, so a GET can hand back a lesson. Validate its
 * shape, acknowledge it, and return the payload once a question is up.
 */
async function throughLessons(
  session: Session,
  payload: { status: number; json: any },
): Promise<{ cur: { status: number; json: any }; lessons: number }> {
  let cur = payload;
  let lessons = 0;
  for (let guard = 0; guard < 10 && cur.json?.mode === "lesson"; guard++) {
    lessons++;
    const L = cur.json.lesson;
    const bad =
      !L ||
      !L.title?.trim() ||
      !L.intro?.trim() ||
      !L.tip?.trim() ||
      !Array.isArray(L.steps) ||
      L.steps.length < 2 ||
      !L.example?.problem?.trim() ||
      !Array.isArray(L.example?.working) ||
      L.example.working.length < 2 ||
      !L.example?.answer?.trim();
    if (bad) throw new Error(`malformed lesson: ${JSON.stringify(L).slice(0, 300)}`);
    await session.req("POST", "/api/quest", { action: "lesson-done" });
    cur = await session.req("GET", "/api/quest");
  }
  return { cur, lessons };
}

async function main() {
  console.log(`E2E against ${BASE}\n`);

  // The parent-PIN section asserts the first-run setup path, which only exists
  // once. Fail loudly and usefully rather than reporting confusing mismatches.
  const probe = await new Session().req("GET", "/api/parent/status");
  if (probe.status !== 200) {
    console.error(`Cannot reach ${BASE} — is the server running?`);
    process.exit(1);
  }
  if (probe.json.pinSet) {
    console.error(
      "This suite needs a fresh database (it tests first-run PIN setup).\n" +
        "Stop the server, delete the data directory, and start it again:\n" +
        "  rm -rf data && QUESTLEARN_E2E=1 npm start",
    );
    process.exit(1);
  }

  // === 1. profile creation ===
  console.log("1. Profile creation");
  const s = new Session();
  const created = await s.req("POST", "/api/students", {
    name: "E2E Tester",
    avatar: "🦉",
    gradeBand: "4-5",
    theme: "space",
  });
  check("student created", created.status === 200 && Boolean(created.json.student?.id));
  const studentId: string = created.json.student.id;

  const bad = await s.req("POST", "/api/students", { name: "", avatar: "nope", gradeBand: "99", theme: "x" });
  check("invalid profile rejected", bad.status === 400, `got ${bad.status}`);

  // === 2. diagnostic, played perfectly → should place high ===
  console.log("\n2. Diagnostic (answering every question correctly)");
  let d = await s.req("PUT", "/api/diagnostic");
  check("diagnostic started", d.status === 200 && d.json.index === 1);
  check("answer key withheld from client", d.json.question && !("answerIndex" in d.json.question));

  const difficultiesSeen: number[] = [];
  let result: any = null;
  for (let i = 0; i < 7; i++) {
    difficultiesSeen.push(d.json.question.difficulty);
    const correctIx = await peek(s);
    const ans = await s.req("POST", "/api/diagnostic", { choiceIndex: correctIx });
    if (ans.status !== 200) { check(`diagnostic answer ${i + 1}`, false, JSON.stringify(ans.json)); break; }
    check(`Q${i + 1} (difficulty ${difficultiesSeen[i]}) graded correct`, ans.json.correct === true);
    if (ans.json.done) { result = ans.json.result; break; }
    d = await s.req("GET", "/api/diagnostic");
  }
  check("diagnostic completed after 7", result !== null);
  check(
    "difficulty climbed for a strong student",
    difficultiesSeen[difficultiesSeen.length - 1] > difficultiesSeen[0],
    `saw ${difficultiesSeen.join("→")}`,
  );
  check("placed at advanced", result?.level === "advanced", `got ${result?.level}`);
  console.log(`     staircase: ${difficultiesSeen.join(" → ")}, placed ${result?.level} @ d${result?.difficulty}`);

  // replaying a graded question must not double-count
  const replay = await s.req("POST", "/api/diagnostic", { choiceIndex: 0 });
  check("replaying a spent question is refused", replay.status === 409, `got ${replay.status}`);

  // === 2b. the ladder spans K-6 ===
  console.log("\n2b. Grade range (K-6)");

  const badGrade = await new Session().req("POST", "/api/students", {
    name: "Nope", avatar: "🦊", gradeBand: "12-14", theme: "space",
  });
  check("a grade outside K-6 is rejected", badGrade.status === 400, `got ${badGrade.status}`);

  // A kindergartener must not open on work three grades above them.
  const k = new Session();
  const kRes = await k.req("POST", "/api/students", {
    name: "Kinder", avatar: "🐝", gradeBand: "K-1", theme: "animals",
  });
  check("kindergarten profile accepted", kRes.status === 200);
  const kFirst = await k.req("PUT", "/api/diagnostic");
  check("K-1 starts at the easiest rung", kFirst.json.question?.difficulty === 1,
    `started at d${kFirst.json.question?.difficulty}`);
  check("K-1 gets prominent read-aloud", kFirst.json.earlyReader === true);

  // Wording is the barrier at this age, so the floor keeps prompts tiny.
  const kWords = kFirst.json.question.prompt.trim().split(/\s+/).length;
  check("K-1 prompts stay short (<= 10 words)", kWords <= 10,
    `${kWords} words: "${kFirst.json.question.prompt}"`);
  console.log(`     K-1 sees: "${kFirst.json.question.prompt}" (${kWords} words)`);

  // Placement is relative to grade — acing the K-1 rung is not "beginner".
  let kResult: any = null;
  for (let i = 0; i < 7; i++) {
    const a = await k.req("POST", "/api/diagnostic", { choiceIndex: await peek(k) });
    if (a.json.done) { kResult = a.json.result; break; }
    await k.req("GET", "/api/diagnostic");
  }
  check("a kindergartener who aces it is not labelled a beginner",
    kResult?.level !== "beginner", `got ${kResult?.level}`);
  // The important half: acing K-1 must not fling them onto 4th-grade content.
  check("a perfect K-1 run stays near grade level (d2 at most)",
    (kResult?.difficulty ?? 9) <= 2, `placed at d${kResult?.difficulty}`);
  console.log(`     K-1 perfect run placed: ${kResult?.level} @ d${kResult?.difficulty}`);

  // A 6th grader starts far higher on the same ladder.
  const six = new Session();
  await six.req("POST", "/api/students", {
    name: "Sixer", avatar: "🦉", gradeBand: "6", theme: "gaming",
  });
  const sixFirst = await six.req("PUT", "/api/diagnostic");
  check("6th grade starts well above K-1", sixFirst.json.question?.difficulty >= 4,
    `started at d${sixFirst.json.question?.difficulty}`);
  check("6th grade does not get the early-reader treatment", sixFirst.json.earlyReader === false);
  console.log(`     6th sees: "${sixFirst.json.question.prompt.slice(0, 70)}…"`);

  // === 3. quest line ===
  console.log("\n3. Quest line");
  const q0raw = await s.req("GET", "/api/quest");
  check("quest line generated", q0raw.status === 200 && Boolean(q0raw.json.questline?.id));

  // === teach-first ===
  check("a new stage opens with a lesson, not a question", q0raw.json.mode === "lesson",
    `mode=${q0raw.json.mode}`);
  const firstLesson = q0raw.json.lesson;
  check("lesson teaches a method (2-4 steps)",
    Array.isArray(firstLesson?.steps) && firstLesson.steps.length >= 2 && firstLesson.steps.length <= 4,
    `steps=${firstLesson?.steps?.length}`);
  check("lesson includes a fully worked example",
    Boolean(firstLesson?.example?.problem) && (firstLesson?.example?.working?.length ?? 0) >= 2 &&
      Boolean(firstLesson?.example?.answer));
  check("lesson names a common mistake", typeof firstLesson?.tip === "string" && firstLesson.tip.length > 10);
  check("lesson matches the stage topic", firstLesson?.topic === q0raw.json.stage?.topic,
    `${firstLesson?.topic} vs ${q0raw.json.stage?.topic}`);
  console.log(`     lesson: "${firstLesson?.title}" — ${firstLesson?.steps?.length} steps, example answer "${firstLesson?.example?.answer}"`);

  // Mid-stage refresher must not consume anything.
  const reread = await s.req("GET", "/api/quest/lesson");
  check("lesson can be re-read mid-stage", reread.status === 200 && Boolean(reread.json.lesson?.title));

  const cleared = await throughLessons(s, q0raw);
  const q0 = cleared.cur;
  check("a question follows the lesson", q0.json.mode === "question" && Boolean(q0.json.question),
    `mode=${q0.json.mode}`);
  check("has 4 stages", q0.json.questline?.stages?.length === 4, `got ${q0.json.questline?.stages?.length}`);
  check("stage 1 active, rest locked",
    q0.json.questline?.stages?.[0]?.status === "active" &&
    q0.json.questline?.stages?.slice(1).every((x: any) => x.status === "locked"));
  check("stages ordered easy → hard",
    isNonDecreasing(q0.json.questline.stages.map((x: any) => x.difficulty)),
    q0.json.questline.stages.map((x: any) => x.difficulty).join(","));
  console.log(`     "${q0.json.questline.title}" — ${q0.json.questline.stages.map((x: any) => `${x.title}(d${x.difficulty})`).join(" → ")}`);

  // === 4. play it through, always correct → XP, levels, stage progress ===
  console.log("\n4. Playing the quest line correctly");
  let xpBefore = q0.json.xp ?? 0;
  let answered = 0;
  let questComplete = false;
  let stagesCleared = 0;
  let leveledUp = false;
  const badges = new Set<string>();

  let lessonsSeen = 1; // the first stage's lesson was cleared above
  for (let i = 0; i < 40 && !questComplete; i++) {
    const raw = i === 0 ? q0 : await s.req("GET", "/api/quest");
    if (raw.json.finished) break;
    const stepped = await throughLessons(s, raw);
    lessonsSeen += stepped.lessons;
    const cur = stepped.cur;
    if (cur.json.finished) break;
    if (!cur.json.question) { check("question served", false, JSON.stringify(cur.json).slice(0, 200)); break; }

    const correctIx = await peek(s);
    const out = await s.req("POST", "/api/quest", { choiceIndex: correctIx, timeMs: 5000 });
    if (out.status !== 200) { check("answer accepted", false, JSON.stringify(out.json)); break; }
    answered++;
    if (out.json.stageComplete) stagesCleared++;
    if (out.json.leveledUp) leveledUp = true;
    for (const b of out.json.newBadges ?? []) badges.add(b.key);
    if (out.json.questComplete) { questComplete = true; xpBefore = out.json.xpTotal; }
  }

  check("quest line completed", questComplete);
  check("cleared 4 stages", stagesCleared === 4, `got ${stagesCleared}`);
  check("12 questions for 4 stages × 3", answered === 12, `got ${answered}`);
  check("every stage taught before it asked (4 lessons)", lessonsSeen === 4, `saw ${lessonsSeen}`);
  check("earned XP", xpBefore > 0, `xp=${xpBefore}`);
  check("levelled up along the way", leveledUp);
  check("earned first_steps badge", badges.has("first_steps"));
  check("earned hot_streak_5 badge (5 correct in a row)", badges.has("hot_streak_5"));
  check("earned quest_done badge", badges.has("quest_done"));
  check("earned speedster badge (10 fast correct)", badges.has("speedster"));
  console.log(`     ${answered} answered, ${xpBefore} XP, badges: ${[...badges].join(", ")}`);

  // === 5. adaptive step-down on a struggling student ===
  console.log("\n5. Adaptive difficulty (deliberately answering wrong)");
  const s2 = new Session();
  const weak = await s2.req("POST", "/api/students", {
    name: "Struggler", avatar: "🐸", gradeBand: "K-1", theme: "sports",
  });
  const weakId = weak.json.student.id;
  await s2.req("PUT", "/api/diagnostic");
  for (let i = 0; i < 7; i++) {
    const correctIx = await peek(s2);
    const a = await s2.req("POST", "/api/diagnostic", { choiceIndex: (correctIx + 1) % 4 });
    if (a.json.done) {
      check("weak student placed at beginner", a.json.result?.level === "beginner", `got ${a.json.result?.level}`);
      break;
    }
    await s2.req("GET", "/api/diagnostic");
  }

  const seen: { difficulty: number; scaffolded: boolean; reason?: string }[] = [];
  let sawStruggleMessage = false;
  for (let i = 0; i < 6; i++) {
    const cur = (await throughLessons(s2, await s2.req("GET", "/api/quest"))).cur;
    if (!cur.json.question) break;
    seen.push({ difficulty: cur.json.question.difficulty, scaffolded: cur.json.question.scaffolded, reason: cur.json.adaptation?.reason });
    if (cur.json.adaptation?.reason === "struggle") sawStruggleMessage = true;
    const correctIx = await peek(s2);
    await s2.req("POST", "/api/quest", { choiceIndex: (correctIx + 1) % 4, timeMs: 30000 });
  }
  check("engine detected struggle", sawStruggleMessage, JSON.stringify(seen));
  check("offered a scaffolded question", seen.some((x) => x.scaffolded), JSON.stringify(seen));
  check("difficulty never climbed while failing",
    Math.max(...seen.map((x) => x.difficulty)) <= seen[0].difficulty,
    seen.map((x) => x.difficulty).join(","));
  console.log(`     difficulty path: ${seen.map((x) => `d${x.difficulty}${x.scaffolded ? "(scaffold)" : ""}`).join(" → ")}`);

  // === 5b. the step-down must be gradual ===
  // Regression guard: difficulty was once adapted in both submitAnswer() and
  // nextQuestion(), so a single struggle dropped a student two rungs (d4 → d2).
  console.log("\n5b. Step-down is one rung at a time (from a high placement)");
  const s3 = new Session();
  await s3.req("POST", "/api/students", {
    name: "Faller", avatar: "🐙", gradeBand: "6", theme: "gaming",
  });
  await s3.req("PUT", "/api/diagnostic");
  let placed: any = null;
  for (let i = 0; i < 7; i++) {
    const a = await s3.req("POST", "/api/diagnostic", { choiceIndex: await peek(s3) });
    if (a.json.done) { placed = a.json.result; break; }
    await s3.req("GET", "/api/diagnostic");
  }
  check("placed high enough to have room to fall", (placed?.difficulty ?? 0) >= 3,
    `difficulty=${placed?.difficulty}`);

  const path: number[] = [];
  for (let i = 0; i < 5; i++) {
    const cur = (await throughLessons(s3, await s3.req("GET", "/api/quest"))).cur;
    if (!cur.json.question) break;
    path.push(cur.json.question.difficulty);
    await s3.req("POST", "/api/quest", { choiceIndex: (await peek(s3) + 1) % 4, timeMs: 30000 });
  }
  const biggestDrop = Math.max(0, ...path.slice(1).map((d, i) => path[i] - d));
  check("never drops more than one difficulty at a time", biggestDrop <= 1,
    `path ${path.join("→")}, biggest drop ${biggestDrop}`);
  check("did step down at all", path[path.length - 1] < path[0], `path ${path.join("→")}`);
  console.log(`     difficulty path: ${path.map((d) => `d${d}`).join(" → ")}`);

  // === 6. parent dashboard access control ===
  console.log("\n6. Parent dashboard");
  const p = new Session();
  const locked = await p.req("GET", "/api/parent");
  check("dashboard refuses without a PIN", locked.status === 403, `got ${locked.status}`);

  const status0 = await p.req("GET", "/api/parent/status");
  check("reports no PIN set yet", status0.json.pinSet === false);

  const tooShort = await p.req("POST", "/api/parent", { pin: "12" });
  check("rejects a 2-digit PIN", tooShort.status === 400, `got ${tooShort.status}`);

  const setPin = await p.req("POST", "/api/parent", { pin: "4821" });
  check("accepts and stores a 4-digit PIN", setPin.status === 200);

  const p2 = new Session();
  const wrong = await p2.req("POST", "/api/parent", { pin: "0000" });
  check("rejects the wrong PIN", wrong.status === 401, `got ${wrong.status}`);
  const right = await p2.req("POST", "/api/parent", { pin: "4821" });
  check("accepts the right PIN", right.status === 200);

  const dash = await p2.req("GET", "/api/parent");
  check("dashboard loads once signed in", dash.status === 200);
  const tester = dash.json.students?.find((x: any) => x.student.id === studentId);
  const struggler = dash.json.students?.find((x: any) => x.student.id === weakId);
  check("strong student has mastered topics", (tester?.mastered?.length ?? 0) > 0,
    JSON.stringify(tester?.mastered));
  check("strong student flagged as fine", (tester?.struggling?.length ?? 0) === 0);
  check("weak student flagged as struggling", (struggler?.struggling?.length ?? 0) > 0,
    JSON.stringify(struggler?.struggling));
  check("summary carries a plain-English headline", typeof struggler?.headline === "string" && struggler.headline.length > 10);
  // Guards a timezone trap: the weekly buckets and the streak must agree about
  // what "today" is, or a student who just played reads as inactive.
  check("today's practice counts toward this week", tester?.activeDaysThisWeek >= 1,
    `activeDaysThisWeek=${tester?.activeDaysThisWeek}`);
  check("today's practice shows in the last bar of the week",
    tester?.lastSevenDays?.[6]?.answered > 0,
    JSON.stringify(tester?.lastSevenDays));
  check("headline doesn't claim an active student is idle",
    !/hasn't practised this week/.test(tester?.headline ?? ""), tester?.headline);
  check("summary exposes no raw answer log", !JSON.stringify(dash.json).includes("time_ms"));
  console.log(`     "${tester?.headline}"`);
  console.log(`     "${struggler?.headline}"`);

  const out = await p2.req("DELETE", "/api/parent");
  check("sign out works", out.status === 200);
  check("dashboard locked again after sign out", (await p2.req("GET", "/api/parent")).status === 403);

  // === 6b. removing a player ===
  console.log("\n6b. Removing a player");

  // A student with real history, so the cascade has something to clear.
  const doomed = new Session();
  const dRes = await doomed.req("POST", "/api/students", {
    name: "Leaver", avatar: "🐧", gradeBand: "K-1", theme: "cooking",
  });
  const doomedId = dRes.json.student.id;
  await doomed.req("PUT", "/api/diagnostic");
  await doomed.req("POST", "/api/diagnostic", { choiceIndex: await peek(doomed) });
  const dq = (await throughLessons(doomed, await doomed.req("GET", "/api/quest"))).cur;
  if (dq.json.question) {
    await doomed.req("POST", "/api/quest", { choiceIndex: await peek(doomed), timeMs: 4000 });
  }

  // Deleting is a grown-up action — an unauthenticated caller must be refused.
  const strangerDelete = await doomed.req("DELETE", `/api/students/${doomedId}`);
  check("delete refused without the parent PIN", strangerDelete.status === 403, `got ${strangerDelete.status}`);

  const stillThere = await new Session().req("GET", "/api/students");
  check("refused delete left the student in place",
    stillThere.json.students?.some((x: any) => x.id === doomedId));

  // Now as a signed-in grown-up.
  const parent = new Session();
  await parent.req("POST", "/api/parent", { pin: "4821" });
  const del = await parent.req("DELETE", `/api/students/${doomedId}`);
  check("parent can delete a student", del.status === 200, `got ${del.status}`);

  const after = await new Session().req("GET", "/api/students");
  check("student gone from the picker",
    !after.json.students?.some((x: any) => x.id === doomedId));

  const dash2 = await parent.req("GET", "/api/parent");
  check("student gone from the dashboard",
    !dash2.json.students?.some((x: any) => x.student.id === doomedId));

  // The promise on the dashboard is that everything goes, not just the row.
  const integrity = await new Session().req("GET", "/api/dev/integrity");
  check("foreign keys are enforced", integrity.json?.foreignKeys === 1 || integrity.json?.foreignKeys === true,
    `pragma=${integrity.json?.foreignKeys}`);
  check("no orphaned rows anywhere after deletion", integrity.json?.totalOrphans === 0,
    JSON.stringify(integrity.json?.orphans));

  // A kid still holding the deleted profile's cookie must land softly.
  const orphanCookie = await doomed.req("GET", "/api/quest");
  check("deleted student's session is rejected, not crashed", orphanCookie.status === 401,
    `got ${orphanCookie.status}`);

  check("deleting one student left the others untouched",
    after.json.students?.some((x: any) => x.id === studentId));

  // === 7. persistence across "sessions" ===
  console.log("\n7. Progress persistence");
  const fresh = new Session();
  const reselect = await fresh.req("GET", `/api/students/${studentId}`);
  check("progress survives a new session", reselect.json.student?.xp === xpBefore,
    `expected ${xpBefore}, got ${reselect.json.student?.xp}`);
  check("badges persisted", (reselect.json.badges?.length ?? 0) >= 4);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

function isNonDecreasing(xs: number[]): boolean {
  return xs.every((x, i) => i === 0 || x >= xs[i - 1]);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});

// Marks this file as a module so its top-level names stay file-scoped.
export {};
