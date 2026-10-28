"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import {
  DEMO_VISITOR_EMAIL,
  demoEnabled,
  demoPassword,
  ensureDemo,
} from "@/server/services/demo";

/**
 * "Explore the demo": signs the visitor in as the read-only demo guest, with no password to type, and
 * opens the sample workspace. Off (404) unless the deployment sets DEMO_ENABLED=1.
 */
export async function startDemo() {
  if (!demoEnabled()) notFound();
  const workspaceId = await ensureDemo();
  await auth.api.signInEmail({
    body: { email: DEMO_VISITOR_EMAIL, password: demoPassword() },
    headers: await headers(),
  });
  redirect(`/w/${workspaceId}`);
}
