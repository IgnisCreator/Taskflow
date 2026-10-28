import { EmailLoginForm } from "@/components/email-login-form";
import { LoginButton } from "@/components/login-button";
import { githubLogin, openAccess } from "@/lib/env";

export default function LoginPage() {
  const github = githubLogin();
  return (
    <main className="mx-auto max-w-sm">
      <div className="card space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        {github && (
          <>
            <LoginButton />
            <p className="text-sm text-muted">or use your email</p>
          </>
        )}
        <EmailLoginForm allowSignUp={openAccess()} />
      </div>
    </main>
  );
}
