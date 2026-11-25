-- BookingStatus: NEW / NEW_FROM_CLIENT / CONFIRMED / CANCELLED
-- Link Booking → WorkOrder; cancel reason; customer/vehicle refs

-- Map legacy booking statuses onto the new appointment model
UPDATE "Booking" SET "status" = 'NEW' WHERE "status" = 'PENDING';
UPDATE "Booking" SET "status" = 'CONFIRMED' WHERE "status" IN ('IN_PROGRESS', 'DONE');

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "customerId" TEXT,
    "postId" TEXT,
    "serviceName" TEXT NOT NULL,
    "plannedAmountRub" INTEGER NOT NULL DEFAULT 0,
    "vehicleInfo" TEXT,
    "vehicleId" TEXT,
    "startsAt" DATETIME NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "cancelReason" TEXT,
    "cancelledAt" DATETIME,
    "workOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ServicePost" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Booking" (
    "id", "organizationId", "clientId", "postId", "serviceName",
    "plannedAmountRub", "vehicleInfo", "startsAt", "durationMin",
    "status", "createdAt"
)
SELECT
    "id", "organizationId", "clientId", "postId", "serviceName",
    "plannedAmountRub", "vehicleInfo", "startsAt", "durationMin",
    "status", "createdAt"
FROM "Booking";

DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE UNIQUE INDEX "Booking_workOrderId_key" ON "Booking"("workOrderId");
CREATE INDEX "Booking_organizationId_startsAt_idx" ON "Booking"("organizationId", "startsAt");
CREATE INDEX "Booking_organizationId_status_idx" ON "Booking"("organizationId", "status");
CREATE INDEX "Booking_clientId_idx" ON "Booking"("clientId");
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");
CREATE INDEX "Booking_vehicleId_idx" ON "Booking"("vehicleId");
CREATE INDEX "Booking_postId_startsAt_idx" ON "Booking"("postId", "startsAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
