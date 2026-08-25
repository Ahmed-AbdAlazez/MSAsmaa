-- AlterTable: make lesson_id nullable, add is_mixed
ALTER TABLE "quizzes" ALTER COLUMN "lesson_id" DROP NOT NULL;
ALTER TABLE "quizzes" ADD COLUMN "is_mixed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: QuizLesson join table for mixed quizzes
CREATE TABLE "quiz_lessons" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,

    CONSTRAINT "quiz_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraint on (quiz_id, lesson_id)
CREATE UNIQUE INDEX "quiz_lessons_quiz_id_lesson_id_key" ON "quiz_lessons"("quiz_id", "lesson_id");

-- AddForeignKey
ALTER TABLE "quiz_lessons" ADD CONSTRAINT "quiz_lessons_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
