import { redirect } from "next/navigation";
import { ApiForm } from "@/components/api-form";
import { ChangePasswordForm } from "@/components/change-password-form";
import { LogoutButton } from "@/components/logout-button";
import { getDigestPreference, hasPassword } from "@/server/services/digest";
import { getCurrentUser } from "@/server/session";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const digest = await getDigestPreference(user.id);
  // The demo visitor shares one account: it has a password but nobody may change it.
  const canChangePassword = !user.isDemo && (await hasPassword(user.id));

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
      <ApiForm
        method="PATCH"
        url="/api/me"
        submit="Save"
        className="card space-y-3"
      >
        <h2 className="text-lg font-semibold">Daily email</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="digestEmail" defaultChecked={digest} />
          Email me the open alerts once a day (they are always in Notifications)
        </label>
      </ApiForm>
      {canChangePassword && <ChangePasswordForm />}
    </main>
  );
}
