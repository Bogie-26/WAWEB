-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "groupJid" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappGroup" (
    "jid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappGroup_pkey" PRIMARY KEY ("jid")
);

-- CreateTable
CREATE TABLE "MessageEvent" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "groupJid" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT,
    "body" TEXT,
    "hasMedia" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationCursor" (
    "applicationId" TEXT NOT NULL,
    "lastSeq" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "ApplicationCursor_pkey" PRIMARY KEY ("applicationId")
);

-- CreateTable
CREATE TABLE "ServiceConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Application_tokenHash_key" ON "Application"("tokenHash");

-- CreateIndex
CREATE INDEX "Subscription_groupJid_idx" ON "Subscription"("groupJid");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_applicationId_groupJid_key" ON "Subscription"("applicationId", "groupJid");

-- CreateIndex
CREATE UNIQUE INDEX "MessageEvent_seq_key" ON "MessageEvent"("seq");

-- CreateIndex
CREATE INDEX "MessageEvent_seq_idx" ON "MessageEvent"("seq");

-- CreateIndex
CREATE INDEX "EventDelivery_status_nextRetryAt_idx" ON "EventDelivery"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "EventDelivery_applicationId_status_idx" ON "EventDelivery"("applicationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventDelivery_eventId_applicationId_key" ON "EventDelivery"("eventId", "applicationId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDelivery" ADD CONSTRAINT "EventDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MessageEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDelivery" ADD CONSTRAINT "EventDelivery_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationCursor" ADD CONSTRAINT "ApplicationCursor_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
