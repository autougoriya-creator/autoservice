-- WorkOrderStatus: NEW / NEW_FROM_CLIENT / CONFIRMED / IN_PROGRESS / CLOSED
-- PaymentMethod + paidAt on WorkOrder
-- Customer.phone required and unique per organization

-- Map legacy work-order statuses
UPDATE "WorkOrder" SET "status" = 'NEW' WHERE "status" IN ('DRAFT', 'OPEN');
UPDATE "WorkOrder" SET "status" = 'CLOSED' WHERE "status" IN ('DONE', 'CANCELLED');

-- Redefine WorkOrder with payment fields and new default status
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_WorkOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
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
    "postId", "scheduledAt", "notes", "createdAt", "updatedAt", "completedAt",
    "paymentMethod", "paidAt"
)
SELECT
    "id", "organizationId", "number", "status", "customerId", "vehicleId",
    "postId", "scheduledAt", "notes", "createdAt", "updatedAt", "completedAt",
    CASE WHEN "status" = 'CLOSED' THEN 'CASH' ELSE NULL END,
    CASE WHEN "status" = 'CLOSED' THEN "completedAt" ELSE NULL END
FROM "WorkOrder";

DROP TABLE "WorkOrder";
ALTER TABLE "new_WorkOrder" RENAME TO "WorkOrder";
CREATE UNIQUE INDEX "WorkOrder_organizationId_number_key" ON "WorkOrder"("organizationId", "number");
CREATE INDEX "WorkOrder_organizationId_status_idx" ON "WorkOrder"("organizationId", "status");
CREATE INDEX "WorkOrder_organizationId_paidAt_idx" ON "WorkOrder"("organizationId", "paidAt");
CREATE INDEX "WorkOrder_customerId_idx" ON "WorkOrder"("customerId");
CREATE INDEX "WorkOrder_vehicleId_idx" ON "WorkOrder"("vehicleId");
CREATE INDEX "WorkOrder_postId_scheduledAt_idx" ON "WorkOrder"("postId", "scheduledAt");

-- Customer: phone required + unique per org
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Customer" ("id", "organizationId", "userId", "name", "phone", "email", "notes", "createdAt", "updatedAt")
SELECT
    "id",
    "organizationId",
    "userId",
    "name",
    COALESCE(NULLIF(TRIM("phone"), ''), 'unknown-' || "id"),
    "email",
    "notes",
    "createdAt",
    "updatedAt"
FROM "Customer";

DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_organizationId_phone_key" ON "Customer"("organizationId", "phone");
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");
CREATE INDEX "Customer_userId_idx" ON "Customer"("userId");
CREATE INDEX "Customer_organizationId_phone_idx" ON "Customer"("organizationId", "phone");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
