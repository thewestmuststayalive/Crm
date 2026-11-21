import { formatCustomValue, type CustomFieldDef } from "@/lib/custom-fields";
import { DetailRow } from "./display";

/** Viser egne felter som rækker i en detaljeliste. */
export function CustomFieldRows({ fields, values }: { fields: CustomFieldDef[]; values: Record<string, unknown> }) {
  return (
    <>
      {fields.map((f) => (
        <DetailRow key={f.id} label={f.label}>
          {formatCustomValue(f, values[f.id])}
        </DetailRow>
      ))}
    </>
  );
}
