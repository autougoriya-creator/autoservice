-- CreateTable
CREATE TABLE "VehicleClass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleClass_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceClassPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "vehicleClassId" TEXT NOT NULL,
    "priceRub" INTEGER NOT NULL,
    CONSTRAINT "ServiceClassPrice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceClassPrice_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceClassPrice_vehicleClassId_fkey" FOREIGN KEY ("vehicleClassId") REFERENCES "VehicleClass" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleClassId" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "year" INTEGER,
    "color" TEXT,
    "vin" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Vehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Vehicle_vehicleClassId_fkey" FOREIGN KEY ("vehicleClassId") REFERENCES "VehicleClass" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Vehicle" ("id", "organizationId", "customerId", "make", "model", "plate", "year", "color", "vin", "createdAt", "updatedAt")
SELECT "id", "organizationId", "customerId", "make", "model", "plate", "year", "color", "vin", "createdAt", "updatedAt" FROM "Vehicle";
DROP TABLE "Vehicle";
ALTER TABLE "new_Vehicle" RENAME TO "Vehicle";
CREATE INDEX "Vehicle_organizationId_idx" ON "Vehicle"("organizationId");
CREATE INDEX "Vehicle_customerId_idx" ON "Vehicle"("customerId");
CREATE INDEX "Vehicle_vehicleClassId_idx" ON "Vehicle"("vehicleClassId");
CREATE INDEX "Vehicle_organizationId_plate_idx" ON "Vehicle"("organizationId", "plate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "VehicleClass_organizationId_sortOrder_idx" ON "VehicleClass"("organizationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleClass_organizationId_code_key" ON "VehicleClass"("organizationId", "code");

-- CreateIndex
CREATE INDEX "ServiceClassPrice_organizationId_idx" ON "ServiceClassPrice"("organizationId");

-- CreateIndex
CREATE INDEX "ServiceClassPrice_vehicleClassId_idx" ON "ServiceClassPrice"("vehicleClassId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceClassPrice_serviceId_vehicleClassId_key" ON "ServiceClassPrice"("serviceId", "vehicleClassId");
