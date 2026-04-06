CREATE TABLE "AssetType" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "icon" TEXT NOT NULL DEFAULT 'Package',
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Asset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "assetTypeId" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "ownershipPercent" REAL NOT NULL DEFAULT 100,
  "purchaseDate" DATETIME NOT NULL,
  "purchasePrice" REAL NOT NULL,
  "notes" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Asset_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "AssetType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Asset_assetTypeId_idx" ON "Asset" ("assetTypeId");

CREATE TABLE "AssetValue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assetId" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "value" REAL NOT NULL,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AssetValue_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssetValue_assetId_date_key" ON "AssetValue" ("assetId", "date");
CREATE INDEX "AssetValue_assetId_idx" ON "AssetValue" ("assetId");
