import { EmailLoginForm } from "@/components/email-login-form";
import { LoginButton } from "@/components/login-button";
import { githubLogin, openAccess } from "@/lib/env";
import { getT } from "@/server/i18n";

export default async function LoginPage() {
  const github = githubLogin();
  const { t } = await getT();
  return (
    <main className="mx-auto max-w-sm">
      <div className="card space-y-4 text-center">
        <h1 className="text-2xl font-semibold">{t.login.title}</h1>
        {github && (
          <>
            <LoginButton />
            <p className="text-sm text-muted">{t.login.orEmail}</p>
          </>
        )}
        <EmailLoginForm allowSignUp={openAccess()} />
      </div>
    </main>
  );
}
