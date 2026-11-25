-- WorkOrderStatus: only IN_PROGRESS / CLOSED (appointment statuses stay on Booking)
UPDATE "WorkOrder" SET "status" = 'IN_PROGRESS'
WHERE "status" IN ('NEW', 'NEW_FROM_CLIENT', 'CONFIRMED');

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_WorkOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "postId" TEXT,
    "scheduledAt" DATETIME,
    "notes" TEXT,
    "paymentMethod" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "WorkOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ServicePost" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_WorkOrder" (
    "id", "organizationId", "number", "status", "customerId", "vehicleId",
    "postId", "scheduledAt", "notes", "paymentMethod", "paidAt",
    "createdAt", "updatedAt", "completedAt"
)
SELECT
    "id", "organizationId", "number", "status", "customerId", "vehicleId",
    "postId", "scheduledAt", "notes", "paymentMethod", "paidAt",
    "createdAt", "updatedAt", "completedAt"
FROM "WorkOrder";

DROP TABLE "WorkOrder";
ALTER TABLE "new_WorkOrder" RENAME TO "WorkOrder";
CREATE UNIQUE INDEX "WorkOrder_organizationId_number_key" ON "WorkOrder"("organizationId", "number");
CREATE INDEX "WorkOrder_organizationId_status_idx" ON "WorkOrder"("organizationId", "status");
CREATE INDEX "WorkOrder_organizationId_paidAt_idx" ON "WorkOrder"("organizationId", "paidAt");
CREATE INDEX "WorkOrder_customerId_idx" ON "WorkOrder"("customerId");
CREATE INDEX "WorkOrder_vehicleId_idx" ON "WorkOrder"("vehicleId");
CREATE INDEX "WorkOrder_postId_scheduledAt_idx" ON "WorkOrder"("postId", "scheduledAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
