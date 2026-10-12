import "server-only";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/server/http";
import { getWorkspace } from "@/server/services/workspaces";
import { getCurrentUser } from "@/server/session";

/** For pages: the signed-in user (or the login page). */
export async function loadUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: the workspace as the user sees it, or the 404 page. */
export async function loadWorkspace(userId: string, workspaceId: string) {
  return getWorkspace(userId, workspaceId).catch((error) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
}
