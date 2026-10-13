-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "DocumentScope" AS ENUM ('METODOLOGIA', 'LEL_DOMINIO', 'ESCENARIOS_REF');

-- CreateEnum
CREATE TYPE "ScenarioType" AS ENUM ('ACTUAL', 'FUTURO', 'INTEGRADOR');

-- CreateEnum
CREATE TYPE "LELCategory" AS ENUM ('SUJETO', 'OBJETO', 'VERBO', 'ESTADO');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" "DocumentScope" NOT NULL DEFAULT 'METODOLOGIA',
    "content" TEXT NOT NULL,
    "filePath" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "vector" vector(384) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ScenarioType" NOT NULL DEFAULT 'ACTUAL',
    "objective" TEXT NOT NULL,
    "contextGeo" TEXT,
    "contextTime" TEXT,
    "contextPrecond" TEXT,
    "actors" TEXT[],
    "resources" TEXT[],
    "episodes" JSONB NOT NULL,
    "exceptions" JSONB,
    "rawMarkdown" TEXT NOT NULL,
    "lelSymbolsUsed" TEXT[],
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "validationReport" JSONB,
    "retrievedLelSymbols" JSONB,
    "retrievedRules" JSONB,
    "geminiResponse" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_scope_uploadedAt_idx" ON "Document"("scope", "uploadedAt");

-- CreateIndex
CREATE INDEX "Embedding_documentId_idx" ON "Embedding"("documentId");

-- CreateIndex
CREATE INDEX "Scenario_type_isValid_idx" ON "Scenario"("type", "isValid");

-- CreateIndex
CREATE INDEX "Scenario_createdAt_idx" ON "Scenario"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

