CREATE TYPE "aff"."activity_definition_status" AS ENUM ('DRAFT', 'PUBLISHED');

ALTER TABLE "aff"."pages" ADD COLUMN "interactions" JSONB;
ALTER TABLE "aff"."activity_definitions"
  ADD COLUMN "status" "aff"."activity_definition_status" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "published_at" TIMESTAMPTZ(3);

UPDATE "aff"."activity_definitions"
SET "status" = 'PUBLISHED', "published_at" = "reviewed_at";

CREATE TABLE "aff"."learner_course_progresses" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "last_page_id" VARCHAR(255),
  "viewed_page_ids" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "learner_course_progresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "aff"."learner_page_progresses" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "page_id" UUID NOT NULL,
  "viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "learner_page_progresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "aff"."activity_attempts" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "activity_id" UUID NOT NULL,
  "definition_version" INTEGER NOT NULL,
  "result" JSONB NOT NULL,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learner_course_progresses_user_id_course_id_key" ON "aff"."learner_course_progresses"("user_id", "course_id");
CREATE UNIQUE INDEX "learner_page_progresses_user_id_page_id_key" ON "aff"."learner_page_progresses"("user_id", "page_id");
CREATE INDEX "activity_attempts_user_id_activity_id_created_at_idx" ON "aff"."activity_attempts"("user_id", "activity_id", "created_at");

ALTER TABLE "aff"."learner_course_progresses" ADD CONSTRAINT "learner_course_progresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "aff"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aff"."learner_course_progresses" ADD CONSTRAINT "learner_course_progresses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "aff"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aff"."learner_page_progresses" ADD CONSTRAINT "learner_page_progresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "aff"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aff"."learner_page_progresses" ADD CONSTRAINT "learner_page_progresses_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "aff"."pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aff"."activity_attempts" ADD CONSTRAINT "activity_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "aff"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aff"."activity_attempts" ADD CONSTRAINT "activity_attempts_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "aff"."activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
