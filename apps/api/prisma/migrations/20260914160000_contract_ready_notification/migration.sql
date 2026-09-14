-- 1C-41 — an electronic contract that nobody has been told about.
--
-- Issuing one used to send nothing: the office pressed "Цахим гэрээ үүсгэх" and
-- the case sat at CONTRACT_DRAFT waiting for a client who had no way of knowing
-- their contract existed. `CONTRACT_READY` is the event that tells them.
--
-- Hand-written rather than generated: `prisma migrate diff` against this schema
-- drops every SQL-only index the database carries.
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'CONTRACT_READY' BEFORE 'CONTRACT_CONFIRMED';
