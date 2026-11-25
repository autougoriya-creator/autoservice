-- CreateTable
CREATE TABLE "FluidSku" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'л',
    "skuCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "quantityOnHand" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FluidSku_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "fluidSkuId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantityDelta" REAL NOT NULL,
    "quantityAfter" REAL NOT NULL,
    "note" TEXT,
    "workOrderId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_fluidSkuId_fkey" FOREIGN KEY ("fluidSkuId") REFERENCES "FluidSku" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceFluidNorm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "fluidSkuId" TEXT NOT NULL,
    "quantityPerUnit" REAL NOT NULL,
    CONSTRAINT "ServiceFluidNorm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceFluidNorm_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceFluidNorm_fluidSkuId_fkey" FOREIGN KEY ("fluidSkuId") REFERENCES "FluidSku" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FluidSku_organizationId_idx" ON "FluidSku"("organizationId");

-- CreateIndex
CREATE INDEX "FluidSku_organizationId_name_idx" ON "FluidSku"("organizationId", "name");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_createdAt_idx" ON "StockMovement"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_fluidSkuId_createdAt_idx" ON "StockMovement"("fluidSkuId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_workOrderId_idx" ON "StockMovement"("workOrderId");

-- CreateIndex
CREATE INDEX "ServiceFluidNorm_organizationId_idx" ON "ServiceFluidNorm"("organizationId");

-- CreateIndex
CREATE INDEX "ServiceFluidNorm_fluidSkuId_idx" ON "ServiceFluidNorm"("fluidSkuId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFluidNorm_serviceId_fluidSkuId_key" ON "ServiceFluidNorm"("serviceId", "fluidSkuId");
