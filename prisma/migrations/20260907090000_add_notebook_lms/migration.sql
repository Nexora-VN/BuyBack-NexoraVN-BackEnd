CREATE TYPE "aff"."notebook_import_status" AS ENUM ('QUEUED', 'EXTRACTING', 'ANALYZING', 'PUBLISHING', 'COMPLETED', 'REQUIRES_REVIEW', 'FAILED');
CREATE TYPE "aff"."activity_status" AS ENUM ('UNMAPPED', 'READY', 'REQUIRES_REVIEW');

CREATE TABLE "aff"."notebook_imports" (
  "id" UUID NOT NULL,
  "source_file_name" VARCHAR(255) NOT NULL,
  "source_key" VARCHAR(512) NOT NULL,
  "status" "aff"."notebook_import_status" NOT NULL DEFAULT 'QUEUED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "current_step" VARCHAR(255),
  "report" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  "created_by_id" UUID NOT NULL,
  CONSTRAINT "notebook_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "aff"."courses" (
  "id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "slug" VARCHAR(255) NOT NULL,
  "outline" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "aff"."pages" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "source_page_id" VARCHAR(255) NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "width" DOUBLE PRECISION NOT NULL,
  "height" DOUBLE PRECISION NOT NULL,
  "content_url" VARCHAR(1024) NOT NULL,
  "navigation" JSONB NOT NULL,
  "audio_hotspots" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "aff"."activity_definitions" (
  "id" UUID NOT NULL,
  "source_hash" VARCHAR(64) NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "config" JSONB NOT NULL,
  "reviewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "aff"."activities" (
  "id" UUID NOT NULL,
  "page_id" UUID NOT NULL,
  "source_hash" VARCHAR(64) NOT NULL,
  "source_path" VARCHAR(1024) NOT NULL,
  "candidate_type" VARCHAR(100),
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "aff"."activity_status" NOT NULL DEFAULT 'UNMAPPED',
  "bounds" JSONB NOT NULL,
  "definition_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "courses_import_id_key" ON "aff"."courses"("import_id");
CREATE UNIQUE INDEX "courses_slug_key" ON "aff"."courses"("slug");
CREATE UNIQUE INDEX "pages_course_id_source_page_id_key" ON "aff"."pages"("course_id", "source_page_id");
CREATE UNIQUE INDEX "activity_definitions_source_hash_key" ON "aff"."activity_definitions"("source_hash");
CREATE INDEX "notebook_imports_status_created_at_idx" ON "aff"."notebook_imports"("status", "created_at");
CREATE INDEX "pages_course_id_sort_order_idx" ON "aff"."pages"("course_id", "sort_order");
CREATE INDEX "activities_source_hash_idx" ON "aff"."activities"("source_hash");
CREATE INDEX "activities_status_idx" ON "aff"."activities"("status");

ALTER TABLE "aff"."notebook_imports" ADD CONSTRAINT "notebook_imports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "aff"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "aff"."courses" ADD CONSTRAINT "courses_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "aff"."notebook_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aff"."pages" ADD CONSTRAINT "pages_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "aff"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aff"."activities" ADD CONSTRAINT "activities_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "aff"."pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aff"."activities" ADD CONSTRAINT "activities_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "aff"."activity_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
