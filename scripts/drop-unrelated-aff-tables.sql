-- Doi chieu voi prisma/schema.prisma va src/ ngay 2026-10-05.
-- Chi xoa 10 bang trong anh DB nexoravn_dev khong thuoc backend Nexora.
-- Chay toan bo file tren PostgreSQL sau khi da sao luu du lieu can giu.
-- RESTRICT se bao loi va rollback neu bang khac/view con phu thuoc vao cac bang nay.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_database() <> 'nexoravn_dev' THEN
    RAISE EXCEPTION 'Sai database: %, can nexoravn_dev', current_database();
  END IF;

  IF to_regclass('aff._prisma_migrations') IS NULL THEN
    RAISE EXCEPTION 'Khong tim thay aff._prisma_migrations; dung lai de kiem tra schema';
  END IF;
END $$;

-- Liet ke cac bang thuc su ton tai truoc khi xoa.
SELECT c.relname AS table_to_drop
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'aff'
  AND c.relkind IN ('r', 'p')
  AND c.relname IN (
    'activities',
    'activity_attempts',
    'activity_definitions',
    'courses',
    'flash_runtime_profiles',
    'flash_runtime_sessions',
    'learner_course_progresses',
    'learner_page_progresses',
    'notebook_imports',
    'pages'
  )
ORDER BY c.relname;

DROP TABLE IF EXISTS
  aff.activities,
  aff.activity_attempts,
  aff.activity_definitions,
  aff.courses,
  aff.flash_runtime_profiles,
  aff.flash_runtime_sessions,
  aff.learner_course_progresses,
  aff.learner_page_progresses,
  aff.notebook_imports,
  aff.pages
RESTRICT;

COMMIT;
