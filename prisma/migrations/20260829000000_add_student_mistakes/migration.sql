-- CreateTable
CREATE TABLE "student_mistakes" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "student_answer" TEXT,
    "correct_answer" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_mistakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_mistakes_attempt_id_question_id_key" ON "student_mistakes"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "student_mistakes_student_id_created_at_idx" ON "student_mistakes"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "student_mistakes_quiz_id_idx" ON "student_mistakes"("quiz_id");

-- CreateIndex
CREATE INDEX "student_mistakes_question_id_idx" ON "student_mistakes"("question_id");

-- AddForeignKey
ALTER TABLE "student_mistakes" ADD CONSTRAINT "student_mistakes_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_mistakes" ADD CONSTRAINT "student_mistakes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_mistakes" ADD CONSTRAINT "student_mistakes_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
