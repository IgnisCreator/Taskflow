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
        <div>
          <p className="text-sm text-slate-600">
            Your public ID. Share it so a project admin can add you.
          </p>
          <code className="mt-1 block break-all rounded bg-slate-100 px-3 py-2 text-sm">
            {user.publicId}
          </code>
        </div>
        <LogoutButton />
      </div>
    </main>
  );
}
