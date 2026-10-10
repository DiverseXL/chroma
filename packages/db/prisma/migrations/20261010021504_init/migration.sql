-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEGRADED');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('PENDING', 'READY', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'REGENERATING');

-- CreateEnum
CREATE TYPE "NodeKind" AS ENUM ('PLAN', 'STYLE_ANALYSIS', 'PROMPT_COMPILE', 'IMAGE_GENERATE', 'IMAGE_EDIT', 'CONSISTENCY_CHECK', 'CRITIQUE', 'GATE', 'COMPOSE');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('IMAGE', 'JSON', 'TEXT');

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "degraded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" "NodeKind" NOT NULL,
    "status" "NodeStatus" NOT NULL,
    "label" TEXT NOT NULL,
    "inputJson" JSONB NOT NULL,
    "outputJson" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edge" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "fromPort" TEXT NOT NULL,
    "toPort" TEXT NOT NULL,

    CONSTRAINT "Edge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "kind" "ArtifactKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Node_runId_status_idx" ON "Node"("runId", "status");

-- CreateIndex
CREATE INDEX "Edge_runId_idx" ON "Edge"("runId");

-- CreateIndex
CREATE INDEX "Artifact_nodeId_idx" ON "Artifact"("nodeId");

-- CreateIndex
CREATE INDEX "Event_runId_sequence_idx" ON "Event"("runId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Event_runId_sequence_key" ON "Event"("runId", "sequence");

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
