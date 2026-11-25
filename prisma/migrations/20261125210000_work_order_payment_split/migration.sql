-- Разбивка суммы при оплате «нал + терминал»
ALTER TABLE "WorkOrder" ADD COLUMN "cashPaidRub" INTEGER;
ALTER TABLE "WorkOrder" ADD COLUMN "terminalPaidRub" INTEGER;
