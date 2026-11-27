import type { Metadata } from "next";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getServices } from "@/lib/booking";
import { getCompanyOptions, getContactOptions } from "@/lib/crm";
import { todayIso } from "@/lib/labels";
import { getModules } from "@/lib/modules";
import { isUuid } from "@/lib/validation";
import { AgreementForm } from "../agreement-form";

export const metadata: Metadata = { title: "Ny fast aftale" };

export default async function NewAgreementPage({ searchParams }: PageProps<"/aftaler/ny">) {
  const { workspace } = await requireRole("ADMIN");
  const sp = await searchParams;
  const [companies, contacts, modules] = await Promise.all([
    getCompanyOptions(workspace.id),
    getContactOptions(workspace.id),
    getModules(workspace.id),
  ]);
  const services = modules.booking ? (await getServices(workspace.id)).map((s) => ({ id: s.id, name: s.name })) : null;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Ny fast aftale" back={{ href: "/aftaler", label: "Faste aftaler" }} />
      <Card>
        <AgreementForm
          companies={companies}
          contacts={contacts}
          services={services}
          initial={{
            name: "",
            companyId: isUuid(sp.virksomhed) ? sp.virksomhed : "",
            contactId: isUuid(sp.kontakt) ? sp.kontakt : "",
            interval: "MONTH",
            intervalCount: 1,
            nextDate: todayIso(),
            endDate: "",
            seasonMonths: [],
            priceAdjustPct: "0",
            priceAdjustMonth: "",
            serviceId: "",
            bookingTime: "",
            invoiceMode: "NONE",
            lines: [{ description: "", quantity: 1, unitPriceOre: 0 }],
          }}
        />
      </Card>
    </div>
  );
}
