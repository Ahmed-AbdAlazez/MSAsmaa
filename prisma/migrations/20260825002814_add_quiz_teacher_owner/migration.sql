-- AlterTable
ALTER TABLE "quiz_attempts" ADD COLUMN     "fullscreen_exits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN     "created_by_teacher_id" TEXT;
