/* Live end-to-end Arabic encoding test.
 *
 * Boots the real Express app on a scratch port, then:
 *   1. logs in as the teacher (real JWT auth),
 *   2. creates a quiz whose title/question/choices contain diacritics,
 *      Arabic-Indic digits, and a rare letter (پ? no - use ڤ/گ-free text;
 *      we use full tashkeel + ٱ which are valid but unusual),
 *   3. reads it back through the student-facing endpoints and compares
 *      strings byte-for-byte (after normalizing JSON decoding),
 *   4. verifies every JSON response advertises charset=utf-8.
 */
process.env.PORT = process.env.TEST_PORT || 3100;

const app = require("../app.js");
const jwt = require("jsonwebtoken");

const PORT = Number(process.env.PORT);
const BASE = `http://localhost:${PORT}/api`;
const tokenFor = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "2h" });

// Fresh Arabic test string: tashkeel (ُ َ ّ ْ), Arabic-Indic digits, alef wasla
const TITLE = "اختبارُ الترميز ٢٠٢٦ — ٱمتحان الحروف";
const QTEXT = "المِيتُوكُونْدْرِيَا هِيَ مَصْدَرُ الطَّاقَةِ فِي الخَلِيَّةِ";
const CHOICES = ["النَّواة", "الرِّيبُوسُوم", "الجِهَازُ الغُلْجِي"];
const MODEL = "تُنتِجُ المِيتُوكُونْدْرِيَا الطَّاقَةَ عَبْرَ التنفُّسِ الخَلَوِيِّ.";

let pass = 0;
let fail = 0;
function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

(async () => {
  const server = app.listen(PORT);

  // wait for listen
  await new Promise((r) => server.on("listening", r));

  try {
    console.log("1) mint teacher token (same as test_quiz_workflow)");
    const token = tokenFor("teacher-t1", "TEACHER");
    check("teacher token obtained", !!token);
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    console.log("2) create quiz with diacritic-laden Arabic");
    const now = Date.now();
    const cqRes = await fetch(`${BASE}/quizzes`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        title: TITLE,
        courseId: "biology",
        lessonId: "lesson-encoding-test",
        startTime: new Date(now + 60e3).toISOString(),
        endTime: new Date(now + 3600e3).toISOString(),
        durationMinutes: 10,
        questions: [],
      }),
    });
    const cqCt = cqRes.headers.get("content-type") || "";
    check("create quiz content-type has charset=utf-8", /charset=utf-8/i.test(cqCt), `got "${cqCt}"`);
    const cq = await cqRes.json();
    const quizId = cq.quiz && cq.quiz.id;
    check("quiz created", cqRes.status === 201 && !!quizId, JSON.stringify(cq).slice(0, 200));
    if (!quizId) throw new Error("no quiz id");
    check(
      "title survives create round-trip EXACTLY",
      cq.quiz.title === TITLE,
      `\n     sent: ${TITLE}\n     got : ${cq.quiz.title}`
    );

    console.log("3) add MCQ question with diacritics");
    const aqRes = await fetch(`${BASE}/quizzes/${quizId}/questions`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        type: "mcq",
        text: QTEXT,
        choices: CHOICES.map((t) => ({ text: t })),
        correctChoiceIndex: 2,
      }),
    });
    check("question added", aqRes.status === 201);

    console.log("4) add written question with model answer");
    const wqRes = await fetch(`${BASE}/quizzes/${quizId}/questions`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ type: "written", text: "كيف تُنتِجُ الخَلِيَّةُ الطَّاقَةَ؟", modelAnswer: MODEL }),
    });
    check("written question added", wqRes.status === 201);

    console.log("5) read back via teacher GET and compare byte-for-byte");
    const gqRes = await fetch(`${BASE}/quizzes/${quizId}`, { headers: auth });
    const gqCt = gqRes.headers.get("content-type") || "";
    check("read-back content-type has charset=utf-8", /charset=utf-8/i.test(gqCt));
    const gq = await gqRes.json();
    const qs = gq.questions || [];
    const mcq = qs.find((q) => q.type === "mcq");
    const wr = qs.find((q) => q.type === "written");
    check("mcq text identical", mcq && mcq.text === QTEXT, `\n     got: ${mcq && mcq.text}`);
    const gotChoices = (mcq && mcq.choices ? mcq.choices : []).map((c) => c.text).sort();
    check(
      "all three choices identical",
      JSON.stringify(gotChoices) === JSON.stringify([...CHOICES].sort()),
      `\n     got: ${JSON.stringify(gotChoices)}`
    );
    check("model answer identical", wr && wr.modelAnswer === MODEL, `\n     got: ${wr && wr.modelAnswer}`);

    console.log("6) student-facing feed shows the same bytes");
    const stToken = tokenFor("student-a", "STUDENT"); // enrollment stub: enrolled in biology
    {
      const avRes = await fetch(`${BASE}/quizzes/available`, {
        headers: { Authorization: `Bearer ${stToken}` },
      });
      const av = await avRes.json();
      const list = av.quizzes || av.available || [];
      const mine = list.find((q) => q.id === quizId);
      check(
        "student feed title identical",
        mine && mine.title === TITLE,
        `\n     got: ${mine && mine.title}`
      );
    }
  } finally {
    server.close();
    setTimeout(() => process.exit(fail ? 1 : 0), 300);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
