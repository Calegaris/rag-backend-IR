-- CreateTable
CREATE TABLE IF NOT EXISTS "ValidationLog" (
    "id" TEXT NOT NULL,
    "scenarioTitle" TEXT NOT NULL,
    "rawInput" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "syntaxErrors" JSONB NOT NULL,
    "semanticIssues" JSONB NOT NULL,
    "llmProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ValidationLog_createdAt_idx" ON "ValidationLog"("createdAt");
