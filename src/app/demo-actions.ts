"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { DEMO_LIMIT, clientAddress, rateLimit } from "@/server/rate-limit";
import {
  MAX_SANDBOXES,
  aliveSandboxes,
  createSandbox,
  demoEnabled,
  leaveSandbox,
  purgeSandboxes,
  restartSandbox,
  sandboxWorkspaceId,
} from "@/server/services/demo";
import { getCurrentUser } from "@/server/session";

/** Opening or rebuilding a sandbox is counted per address; with no address there is nothing to count by. */
async function withinLimit() {
  const address = clientAddress(await headers());
  return !address || (await rateLimit(`demo:${address}`, DEMO_LIMIT)).ok;
}

/**
 * "Explore the demo": opens a private sandbox (a temporary user who owns a copy of the sample
 * workspace) and signs the visitor in, with no password to type. Off (404) unless the deployment sets
 * DEMO_ENABLED=1. It never replaces a session that already exists.
 */
export async function startDemo() {
  if (!demoEnabled()) notFound();
  const user = await getCurrentUser();
  if (user) {
    const own = await sandboxWorkspaceId(user.id);
    redirect(own ? `/w/${own}` : "/workspaces");
  }
  if (!(await withinLimit())) redirect("/?demo=limit");
  await purgeSandboxes(Date.now(), 20);
  if ((await aliveSandboxes()) >= MAX_SANDBOXES) redirect("/?demo=busy");
  const sandbox = await createSandbox();
  await auth.api.signInEmail({
    body: { email: sandbox.email, password: sandbox.password },
    headers: await headers(),
  });
  redirect(`/w/${sandbox.workspaceId}`);
}

/** Back to the sample data. The sandbox keeps its deadline, so nobody keeps one forever. */
export async function restartDemo() {
  if (!demoEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user?.sandboxUntil) redirect("/");
  if (!(await withinLimit())) redirect("/?demo=limit");
  const built = await restartSandbox(user.id);
  redirect(built ? `/w/${built.workspaceId}` : "/");
}

/** The visitor is done: their sandbox is deleted now and they are signed out. */
export async function leaveDemo() {
  const user = await getCurrentUser();
  if (user?.sandboxUntil) {
    await auth.api.signOut({ headers: await headers() });
    await leaveSandbox(user.id);
  }
  redirect("/");
}
