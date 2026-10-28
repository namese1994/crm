-- AlterTable
ALTER TABLE "careConversation" ADD COLUMN     "activityVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "careSyncState" (
    "id" TEXT NOT NULL,
    "watermark" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,

    CONSTRAINT "careSyncState_pkey" PRIMARY KEY ("id")
);

