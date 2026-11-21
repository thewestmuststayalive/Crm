import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PasswordForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Min profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <Card title="Profil" description={user.email}>
        <ProfileForm name={user.name} />
      </Card>
      <Card title="Skift adgangskode" description="Du bliver logget ud på alle andre enheder.">
        <PasswordForm />
      </Card>
    </div>
  );
}
