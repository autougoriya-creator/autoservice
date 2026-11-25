-- Per-post working hours and multi-washer share of post payroll
ALTER TABLE "ServicePost" ADD COLUMN "workStartHour" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "ServicePost" ADD COLUMN "workEndHour" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "PostAssignment" ADD COLUMN "sharePercent" INTEGER NOT NULL DEFAULT 100;
