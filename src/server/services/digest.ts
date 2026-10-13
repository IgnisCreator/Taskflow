import "server-only";
import { db } from "@/server/db";
import { sendEmail } from "@/server/email";
import { listNotifications } from "@/server/services/notifications";

const ONCE_PER = 20 * 3_600_000; // a day, with room for the cron's drift

/** Whether the user asked for the daily email (kept out of the session profile, which is public-shaped). */
export async function getDigestPreference(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { digestEmail: true },
  });
  return user.digestEmail;
}

/**
 * The optional daily email: for each user who asked for it and has open alerts, one message listing
 * them. At most one per user per day (checked in EmailLog), and the outcome is always logged.
 */
export async function sendDigests(now = Date.now()) {
  const users = await db.user.findMany({
    where: { digestEmail: true, emailVerified: true },
    select: { id: true, name: true, email: true },
  });
  const totals = { sent: 0, skipped: 0, failed: 0 };
  for (const user of users) {
    const recent = await db.emailLog.findFirst({
      where: {
        userId: user.id,
        status: "SENT",
        createdAt: { gt: new Date(now - ONCE_PER) },
      },
      select: { id: true },
    });
    const { open } = await listNotifications(user.id);
    if (recent || open.length === 0) {
      totals.skipped++;
      continue;
    }
    const subject = `TaskFlow: ${open.length} open ${open.length === 1 ? "alert" : "alerts"}`;
    try {
      await sendEmail({
        to: user.email,
        subject,
        text: `Hi ${user.name},\n\n${open
          .map((n) => `- ${n.listName}: ${n.message}`)
          .join("\n")}\n\nYou can turn this email off in your profile.`,
      });
      await db.emailLog.create({
        data: { userId: user.id, subject, status: "SENT" },
      });
      totals.sent++;
    } catch (error) {
      await db.emailLog.create({
        data: {
          userId: user.id,
          subject,
          status: "FAILED",
          error: (error as Error).message.slice(0, 200),
        },
      });
      totals.failed++;
    }
  }
  return totals;
}
