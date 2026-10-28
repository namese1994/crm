CREATE TYPE "CareIntegrationKind" AS ENUM ('POSCAKE', 'LLM');

CREATE TYPE "CareJobState" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'IGNORED');

CREATE TABLE "careIntegration" (
    "id" TEXT NOT NULL,
    "kind" "CareIntegrationKind" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "secrets" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "checkedVersion" INTEGER,
    "checkRequestedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "careIntegration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "careWebhookReceipt" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "state" "CareJobState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "careWebhookReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "careAiJob" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "configVersion" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB,
    "state" "CareJobState" NOT NULL DEFAULT 'PENDING',
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "careAiJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "careIntegration_kind_key" ON "careIntegration"("kind");

CREATE INDEX "careWebhookReceipt_state_nextAttemptAt_idx" ON "careWebhookReceipt"("state", "nextAttemptAt");

CREATE UNIQUE INDEX "careWebhookReceipt_integrationId_eventKey_key" ON "careWebhookReceipt"("integrationId", "eventKey");

CREATE INDEX "careAiJob_state_createdAt_idx" ON "careAiJob"("state", "createdAt");

CREATE UNIQUE INDEX "careAiJob_createdBy_requestId_key" ON "careAiJob"("createdBy", "requestId");

ALTER TABLE "careWebhookReceipt" ADD CONSTRAINT "careWebhookReceipt_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "careIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "careAiJob" ADD CONSTRAINT "careAiJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "careIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

