import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser } from "@/server/session";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main>
      <h1>Profile</h1>
      <p>{user.name}</p>
      <p>
        Your public ID (share it so a project admin can add you):{" "}
        <code>{user.publicId}</code>
      </p>
      <LogoutButton />
    </main>
  );
}
