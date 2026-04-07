CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "iban" TEXT,
    "bank" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CHECKING',
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "icon" TEXT,
    "currentBalance" REAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
, sortOrder INTEGER NOT NULL DEFAULT 0);
CREATE TABLE AppSetting (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
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
CREATE TABLE "AssetType" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "icon" TEXT NOT NULL DEFAULT 'Package',
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
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
CREATE TABLE "BudgetEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "budgeted" REAL NOT NULL DEFAULT 0,
    "rolledOver" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BudgetEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "icon" TEXT,
    "type" TEXT NOT NULL DEFAULT 'EXPENSE',
    "groupId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL, subAccountGroupId TEXT REFERENCES SubAccountGroup(id), subAccountLinkType TEXT NOT NULL DEFAULT 'BOOKING', rolloverEnabled BOOLEAN NOT NULL DEFAULT 1,
    CONSTRAINT "Category_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CategoryGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "CategoryGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "accountId" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CategoryGroup_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "CsvProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "delimiter" TEXT NOT NULL DEFAULT ';',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD.MM.YYYY',
    "encoding" TEXT NOT NULL DEFAULT 'UTF-8',
    "skipRows" INTEGER NOT NULL DEFAULT 0,
    "columnMapping" TEXT NOT NULL,
    "amountFormat" TEXT NOT NULL DEFAULT 'DE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE Loan (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    loanType TEXT NOT NULL DEFAULT 'ANNUITAETENDARLEHEN',
    principal REAL NOT NULL,
    interestRate REAL NOT NULL,
    termMonths INTEGER NOT NULL,
    startDate DATETIME NOT NULL,
    monthlyPayment REAL NOT NULL,
    accountId TEXT,
    notes TEXT,
    isActive BOOLEAN NOT NULL DEFAULT true,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, initialRepaymentRate REAL NOT NULL DEFAULT 0, categoryId TEXT, paidUntil DATETIME,
    FOREIGN KEY (accountId) REFERENCES Account(id) ON DELETE SET NULL
  );
CREATE TABLE LoanPayment (
    id TEXT NOT NULL PRIMARY KEY,
    loanId TEXT NOT NULL,
    periodNumber INTEGER NOT NULL,
    dueDate DATETIME NOT NULL,
    scheduledPrincipal REAL NOT NULL,
    scheduledInterest REAL NOT NULL,
    scheduledBalance REAL NOT NULL,
    extraPayment REAL NOT NULL DEFAULT 0,
    paidAt DATETIME,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, transactionId TEXT,
    UNIQUE(loanId, periodNumber),
    FOREIGN KEY (loanId) REFERENCES Loan(id) ON DELETE CASCADE
  );
CREATE TABLE "Portfolio" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "notes" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "PortfolioValue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "portfolioId" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "value" REAL NOT NULL,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PortfolioValue_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "statementBalance" REAL NOT NULL,
    "clearedBalance" REAL NOT NULL,
    "difference" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reconciliation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE SavingsConfig (
  id                    TEXT NOT NULL PRIMARY KEY,
  accountId             TEXT NOT NULL UNIQUE,
  initialBalance        REAL NOT NULL DEFAULT 0,
  accountNumber         TEXT,
  contributionAmount    REAL NOT NULL DEFAULT 0,
  contributionFrequency TEXT,
  interestRate          REAL NOT NULL,
  interestFrequency     TEXT NOT NULL,
  startDate             DATETIME NOT NULL,
  termMonths            INTEGER,
  linkedAccountId       TEXT,
  categoryId            TEXT,
  notes                 TEXT,
  createdAt             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, upfrontFee FLOAT NOT NULL DEFAULT 0,
  FOREIGN KEY (accountId) REFERENCES Account(id),
  FOREIGN KEY (linkedAccountId) REFERENCES Account(id)
);
CREATE TABLE SavingsEntry (
  id               TEXT NOT NULL PRIMARY KEY,
  savingsConfigId  TEXT NOT NULL,
  entryType        TEXT NOT NULL,
  periodNumber     INTEGER NOT NULL,
  dueDate          DATETIME NOT NULL,
  scheduledAmount  REAL NOT NULL,
  scheduledBalance REAL NOT NULL,
  paidAt           DATETIME,
  transactionId    TEXT UNIQUE,
  giroTransactionId TEXT UNIQUE,
  createdAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (savingsConfigId) REFERENCES SavingsConfig(id) ON DELETE CASCADE,
  UNIQUE(savingsConfigId, entryType, periodNumber)
);
CREATE TABLE SubAccount (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    accountId TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, initialBalance REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (accountId) REFERENCES Account(id)
  );
CREATE TABLE SubAccountEntry (
    id TEXT PRIMARY KEY,
    date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    fromBudget INTEGER NOT NULL DEFAULT 0,
    groupId TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (groupId) REFERENCES SubAccountGroup(id)
  );
CREATE TABLE SubAccountGroup (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subAccountId TEXT NOT NULL,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, initialBalance REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (subAccountId) REFERENCES SubAccount(id)
  );
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "payee" TEXT,
    "notes" TEXT,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "importHash" TEXT,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "transferToId" TEXT, subAccountEntryId TEXT REFERENCES SubAccountEntry(id), mainAmount REAL, mainType TEXT NOT NULL DEFAULT 'INCOME', subAmount REAL, subType TEXT,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_transferToId_fkey" FOREIGN KEY ("transferToId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Account_iban_key" ON "Account"("iban");
CREATE UNIQUE INDEX "AssetValue_assetId_date_key" ON "AssetValue" ("assetId", "date");
CREATE INDEX "AssetValue_assetId_idx" ON "AssetValue" ("assetId");
CREATE INDEX "Asset_assetTypeId_idx" ON "Asset" ("assetTypeId");
CREATE UNIQUE INDEX "BudgetEntry_categoryId_month_year_key" ON "BudgetEntry"("categoryId", "month", "year");
CREATE INDEX "BudgetEntry_year_month_idx" ON "BudgetEntry"("year", "month");
CREATE INDEX "CategoryGroup_accountId_idx" ON "CategoryGroup"("accountId");
CREATE INDEX LoanPayment_loanId_idx ON LoanPayment(loanId);
CREATE UNIQUE INDEX LoanPayment_transactionId_key ON LoanPayment(transactionId) WHERE transactionId IS NOT NULL;
CREATE INDEX Loan_accountId_idx ON Loan(accountId);
CREATE UNIQUE INDEX "PortfolioValue_portfolioId_date_key" ON "PortfolioValue" ("portfolioId", "date");
CREATE INDEX "PortfolioValue_portfolioId_idx" ON "PortfolioValue" ("portfolioId");
CREATE INDEX SavingsEntry_savingsConfigId_idx ON SavingsEntry(savingsConfigId);
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE UNIQUE INDEX "Transaction_importHash_key" ON "Transaction"("importHash");
CREATE UNIQUE INDEX "Transaction_transferToId_key" ON "Transaction"("transferToId");
CREATE UNIQUE INDEX idx_transaction_subAccountEntryId ON "Transaction"(subAccountEntryId) WHERE subAccountEntryId IS NOT NULL;
