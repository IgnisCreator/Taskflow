import { EmailLoginForm } from "@/components/email-login-form";
import { LoginButton } from "@/components/login-button";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm">
      <div className="card space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <LoginButton />
        <p className="text-sm text-muted">or use your email</p>
        <EmailLoginForm />
      </div>
    </main>
  );
}
