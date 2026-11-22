import type { NotificationType } from "@/db/schema";

/** Notifikationstyper og deres navne i indstillingerne. Rækkefølgen er visningsrækkefølgen. */
export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  NEW_LEAD: "Nye leads og henvendelser",
  NEW_CONVERSATION: "Nye beskeder i indbakken",
  TASK_ASSIGNED: "Opgaver tildelt mig",
  DEAL_WON: "Vundne deals",
  MEMBER_ADDED: "Nye medlemmer",
  QUOTE_VIEWED: "Kunden har åbnet et tilbud",
  QUOTE_ACCEPTED: "Tilbud accepteret",
  QUOTE_DECLINED: "Tilbud afvist",
  NEW_BOOKING: "Nye bookinger",
  BOOKING_CANCELLED: "Aflyste bookinger",
  RETAINER_ALERT: "Advarsler om retainers",
};

export const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_LABELS) as NotificationType[];
