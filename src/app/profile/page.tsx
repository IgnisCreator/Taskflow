import { redirect } from "next/navigation";
import { ApiForm } from "@/components/api-form";
import { ChangePasswordForm } from "@/components/change-password-form";
import { LogoutButton } from "@/components/logout-button";
import { getT } from "@/server/i18n";
import { getDigestPreference, hasPassword } from "@/server/services/digest";
import { getCurrentUser } from "@/server/session";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  const digest = await getDigestPreference(user.id);
  // A demo sandbox has a password nobody knows and nobody may change.
  const canChangePassword =
    !user.isDemo && !user.sandboxUntil && (await hasPassword(user.id));

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">{t.profile.title}</h1>
      <div className="card space-y-4">
        <p className="text-lg font-medium">{user.name}</p>
        <p className="text-sm text-muted">{t.profile.joinHint}</p>
        <LogoutButton />
      </div>
      <ApiForm
        method="PATCH"
        url="/api/me"
        submit={t.profile.save}
        className="card space-y-3"
      >
        <h2 className="text-lg font-semibold">{t.profile.dailyEmail}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="digestEmail" defaultChecked={digest} />
          {t.profile.dailyEmailLabel}
        </label>
      </ApiForm>
      {canChangePassword && <ChangePasswordForm />}
    </main>
  );
}
