-- CreateEnum
CREATE TYPE "CareBrand" AS ENUM ('UMEHA', 'LI_EN_SPORT');

-- CreateEnum
CREATE TYPE "CareOrderStatus" AS ENUM ('PENDING', 'DELIVERED', 'PARTIAL', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "CareTaskState" AS ENUM ('OPEN', 'CLAIMED', 'COPIED', 'WAITING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CarePurpose" AS ENUM ('CHECK_IN', 'USE_VALUE', 'EXPERIENCE', 'REORDER', 'REACTIVATE', 'REVIEW');

-- CreateTable
CREATE TABLE "careCustomer" (
    "id" TEXT NOT NULL,
    "brand" "CareBrand" NOT NULL,
    "shopId" TEXT NOT NULL,
    "sourceCustomerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ownerId" TEXT,
    "enrolled" BOOLEAN NOT NULL DEFAULT false,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "openIssue" BOOLEAN NOT NULL DEFAULT false,
    "uncertain" BOOLEAN NOT NULL DEFAULT false,
    "replyPending" BOOLEAN NOT NULL DEFAULT false,
    "pausedUntil" TIMESTAMP(3),
    "lastTouchAt" TIMESTAMP(3),
    "unanswered" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "careCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careOrder" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceOrderId" TEXT NOT NULL,
    "status" "CareOrderStatus" NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "deliveryEvidence" TEXT,
    "products" JSONB NOT NULL,
    "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "careOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careConversation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "canSend" BOOLEAN,

    CONSTRAINT "careConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careTemplate" (
    "id" TEXT NOT NULL,
    "brand" "CareBrand" NOT NULL,
    "purpose" "CarePurpose" NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requiredTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "validUntil" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "careTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careTask" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "milestone" INTEGER NOT NULL,
    "purpose" "CarePurpose" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "state" "CareTaskState" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "snapshot" TEXT,
    "copiedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "careTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "taskId" TEXT,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "careEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "careCustomer_enrolled_ownerId_idx" ON "careCustomer"("enrolled", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "careCustomer_brand_shopId_sourceCustomerId_key" ON "careCustomer"("brand", "shopId", "sourceCustomerId");

-- CreateIndex
CREATE INDEX "careOrder_customerId_deliveredAt_idx" ON "careOrder"("customerId", "deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "careOrder_customerId_sourceOrderId_key" ON "careOrder"("customerId", "sourceOrderId");

-- CreateIndex
CREATE INDEX "careConversation_customerId_idx" ON "careConversation"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "careConversation_pageId_sourceId_key" ON "careConversation"("pageId", "sourceId");

-- CreateIndex
CREATE INDEX "careTemplate_brand_purpose_approvedAt_idx" ON "careTemplate"("brand", "purpose", "approvedAt");

-- CreateIndex
CREATE INDEX "careTask_state_dueAt_idx" ON "careTask"("state", "dueAt");

-- CreateIndex
CREATE INDEX "careTask_customerId_state_idx" ON "careTask"("customerId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "careTask_orderId_milestone_key" ON "careTask"("orderId", "milestone");

-- CreateIndex
CREATE INDEX "careEvent_customerId_createdAt_idx" ON "careEvent"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "careOrder" ADD CONSTRAINT "careOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "careCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "careConversation" ADD CONSTRAINT "careConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "careCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "careTask" ADD CONSTRAINT "careTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "careCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "careTask" ADD CONSTRAINT "careTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "careOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "careEvent" ADD CONSTRAINT "careEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "careCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "careEvent" ADD CONSTRAINT "careEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "careTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

