import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { NOTIFICATION_LABELS, NOTIFICATION_TYPES } from "@/lib/notification-types";
import { PasswordForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Min profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [prefs] = await db
    .select({ emailNotifications: schema.users.emailNotifications, muted: schema.users.mutedEmailTypes })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);
  return (
    <div className="space-y-6">
      <Card title="Profil" description={user.email}>
        <ProfileForm
          name={user.name}
          emailNotifications={prefs?.emailNotifications ?? true}
          types={NOTIFICATION_TYPES.map((key) => ({ key, label: NOTIFICATION_LABELS[key] }))}
          muted={prefs?.muted ?? []}
        />
      </Card>
      <Card title="Skift adgangskode" description="Du bliver logget ud på alle andre enheder.">
        <PasswordForm />
      </Card>
    </div>
  );
}
