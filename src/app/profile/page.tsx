import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser } from "@/server/session";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <div className="card space-y-4">
        <p className="text-lg font-medium">{user.name}</p>
        <p className="text-sm text-muted">
          To join a workspace, give its admin the email you sign in with.
        </p>
        <LogoutButton />
      </div>
    </main>
  );
}
