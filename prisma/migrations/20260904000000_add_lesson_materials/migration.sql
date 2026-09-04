CREATE TABLE "lesson_materials" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "drive_file_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lesson_materials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lesson_materials_drive_file_id_key" ON "lesson_materials"("drive_file_id");
CREATE INDEX "lesson_materials_lesson_id_created_at_idx" ON "lesson_materials"("lesson_id", "created_at");