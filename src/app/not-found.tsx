import Link from "next/link";
import { getT } from "@/server/i18n";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main className="space-y-3">
      <h1 className="text-2xl font-semibold">{t.errors.notFoundTitle}</h1>
      <p className="text-muted">{t.errors.notFoundBody}</p>
      <Link href="/workspaces" className="btn-secondary">
        {t.errors.backToWorkspaces}
      </Link>
    </main>
  );
}
