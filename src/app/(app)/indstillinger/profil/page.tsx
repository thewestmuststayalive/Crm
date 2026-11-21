import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { PasswordForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Min profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [prefs] = await db
    .select({ emailNotifications: schema.users.emailNotifications })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);
  return (
    <div className="space-y-6">
      <Card title="Profil" description={user.email}>
        <ProfileForm name={user.name} emailNotifications={prefs?.emailNotifications ?? true} />
      </Card>
      <Card title="Skift adgangskode" description="Du bliver logget ud på alle andre enheder.">
        <PasswordForm />
      </Card>
    </div>
  );
}
