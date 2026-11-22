import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["OWNER", "ADMIN", "MEMBER"]);
export type Role = (typeof roleEnum.enumValues)[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** Modtag e-mail ved nye leads tildelt brugeren. */
  emailNotifications: boolean("email_notifications").notNull().default(true),
  /** Notifikationstyper brugeren ikke vil have på e-mail (de vises stadig i appen). */
  mutedEmailTypes: jsonb("muted_email_types").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 af det token, der ligger i cookien. Selve tokenet gemmes aldrig.
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Et workspace svarer til ét af dine firmaer. Alle CRM-data hører til et workspace. */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Mål for svartid i minutter. Henvendelser der har ventet længere, fremhæves. */
  responseTargetMinutes: integer("response_target_minutes").notNull().default(120),
  // Firmaoplysninger, der vises på tilbud og e-mails til kunder.
  cvr: text("cvr"),
  address: text("address"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  quoteTerms: text("quote_terms"),
  // Anmodning om anmeldelse efter en vundet deal.
  reviewEnabled: boolean("review_enabled").notNull().default(false),
  reviewUrl: text("review_url"),
  reviewDelayDays: integer("review_delay_days").notNull().default(3),
  reviewMessage: text("review_message"),
  /** Slet leads uden aktivitet efter så mange måneder (GDPR-dataminimering). Null = slået fra. */
  leadRetentionMonths: integer("lead_retention_months"),
  // Moduler, der kan slås til pr. firma.
  /** Booking, kalender og biler (fx bilpleje). */
  bookingEnabled: boolean("booking_enabled").notNull().default(false),
  // Udseende på kundesider og i e-mails.
  /** Logo som data-URL (PNG/JPEG/WebP, højst 300 KB). */
  logoData: text("logo_data"),
  /** Firmafarve som hex, fx "#1b6257". */
  brandColor: text("brand_color"),
  /** Egne tekster i e-mails til kunder, nøglet på e-mailtype. */
  emailTexts: jsonb("email_texts").$type<Record<string, string>>().notNull().default({}),
  /** Tidsregistrering, retainers og projekter (fx bureau). */
  agencyEnabled: boolean("agency_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("MEMBER"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.workspaceId] }),
    index("memberships_workspace_idx").on(t.workspaceId),
  ],
);

// ---------------------------------------------------------------------------
// CRM-data. Alle tabeller har workspace_id, og ALLE forespørgsler skal filtrere på det.
// ---------------------------------------------------------------------------

export const contactStatusEnum = pgEnum("contact_status", ["LEAD", "CUSTOMER", "INACTIVE"]);
export type ContactStatus = (typeof contactStatusEnum.enumValues)[number];

export const leadSourceEnum = pgEnum("lead_source", [
  "MANUAL",
  "WEBSITE",
  "META_LEAD",
  "MESSENGER",
  "INSTAGRAM",
  "PHONE",
  "REFERRAL",
  "OTHER",
  "IMPORT",
  "BOOKING",
]);
export type LeadSource = (typeof leadSourceEnum.enumValues)[number];

// SYSTEM bruges til automatiske hændelser (fx en deal der skifter fase) og kan ikke vælges i UI.
export const activityTypeEnum = pgEnum("activity_type", ["NOTE", "CALL", "EMAIL", "MEETING", "SYSTEM"]);
export type ActivityType = (typeof activityTypeEnum.enumValues)[number];

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Kundens virksomhed (ikke at forveksle med dine egne firmaer = workspaces). */
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cvr: text("cvr"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    address: text("address"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** Værdier for firmaets egne felter, nøglet på felt-id. */
    custom: jsonb("custom").$type<Record<string, unknown>>().notNull().default({}),
    /** Hemmeligt id i linket til kundens månedsrapport. */
    reportToken: text("report_token").unique(),
    /** Send månedsrapporten automatisk den 1. til denne e-mail. */
    reportEnabled: boolean("report_enabled").notNull().default(false),
    reportEmail: text("report_email"),
    reportLastSentMonth: text("report_last_sent_month"),
    ...timestamps,
  },
  (t) => [index("companies_workspace_name_idx").on(t.workspaceId, t.name)],
);

/** En person: lead eller kunde. Kan høre til en virksomhed, men behøver ikke (privatkunder). */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    status: contactStatusEnum("status").notNull().default("LEAD"),
    source: leadSourceEnum("source").notNull().default("MANUAL"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** Sat når kontakten har henvendt sig og venter på at blive kontaktet; nulstilles når nogen svarer. */
    awaitingSince: timestamp("awaiting_since", { withTimezone: true }),
    /** Personen har frabedt sig e-mails (fx anmodninger om anmeldelse). */
    emailOptOutAt: timestamp("email_opt_out_at", { withTimezone: true }),
    custom: jsonb("custom").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("contacts_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("contacts_awaiting_idx").on(t.workspaceId, t.awaitingSince),
    index("contacts_company_idx").on(t.companyId),
  ],
);

/** Om en deal er åben, vundet eller tabt. Afledt af den fase, dealen står i. */
export const dealStatusEnum = pgEnum("deal_status", ["OPEN", "WON", "LOST"]);
export type DealStatus = (typeof dealStatusEnum.enumValues)[number];

/** En salgsproces. Hvert firma har mindst én ("Salg") og kan oprette flere. */
export const pipelines = pgTable(
  "pipelines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pipelines_workspace_idx").on(t.workspaceId, t.position)],
);

/** En fase i en pipeline. `kind` afgør om deals i fasen er åbne, vundne eller tabte. */
export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    kind: dealStatusEnum("kind").notNull().default("OPEN"),
  },
  (t) => [index("pipeline_stages_pipeline_idx").on(t.pipelineId, t.position)],
);

/** En salgsmulighed i pipelinen. Værdi i hele kroner. */
export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    value: integer("value").notNull().default(0),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "restrict" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStages.id, { onDelete: "restrict" }),
    status: dealStatusEnum("status").notNull().default("OPEN"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    source: leadSourceEnum("source").notNull().default("MANUAL"),
    expectedCloseDate: date("expected_close_date"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    custom: jsonb("custom").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("deals_workspace_status_idx").on(t.workspaceId, t.status),
    index("deals_stage_idx").on(t.stageId),
    index("deals_contact_idx").on(t.contactId),
    index("deals_company_idx").on(t.companyId),
  ],
);

/** Opfølgning med frist og ansvarlig, evt. knyttet til en kontakt, virksomhed eller deal. */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueDate: date("due_date"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references((): AnyPgColumn => projects.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasks_workspace_open_idx").on(t.workspaceId, t.completedAt, t.dueDate),
    index("tasks_contact_idx").on(t.contactId),
    index("tasks_company_idx").on(t.companyId),
    index("tasks_deal_idx").on(t.dealId),
  ],
);

/** En kontaktformular på en hjemmeside. Nøglen indgår i den offentlige URL. */
export const leadForms = pgTable(
  "lead_forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key").notNull().unique(),
    redirectUrl: text("redirect_url"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createDeal: boolean("create_deal").notNull().default(true),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_forms_workspace_idx").on(t.workspaceId)],
);

/** Log over modtagne henvendelser (bruges også til at begrænse spam pr. IP). */
export const leadSubmissions = pgTable(
  "lead_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    formId: uuid("form_id").references(() => leadForms.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    ipHash: text("ip_hash"),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_submissions_form_idx").on(t.formId, t.createdAt),
    index("lead_submissions_ip_idx").on(t.ipHash, t.createdAt),
  ],
);

/** Tidslinje: noter, opkald, e-mails, møder og hændelser på en kontakt, virksomhed eller deal. */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    type: activityTypeEnum("type").notNull().default("NOTE"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activities_contact_idx").on(t.contactId, t.createdAt),
    index("activities_company_idx").on(t.companyId, t.createdAt),
    index("activities_deal_idx").on(t.dealId, t.createdAt),
    index("activities_workspace_idx").on(t.workspaceId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Meta (Facebook/Instagram). Adgangstokens gemmes krypteret (se src/lib/crypto.ts).
// ---------------------------------------------------------------------------

/** Forbindelsen til en Facebook-bruger, der har givet CRM'et adgang for et firma. */
export const metaConnections = pgTable("meta_connections", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  fbUserId: text("fb_user_id").notNull(),
  fbUserName: text("fb_user_name"),
  userTokenEnc: text("user_token_enc").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  connectedById: uuid("connected_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** En Facebook-side (evt. med tilknyttet Instagram-konto). En side kan kun høre til ét firma. */
export const metaPages = pgTable(
  "meta_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pageId: text("page_id").notNull().unique(),
    name: text("name").notNull(),
    pageTokenEnc: text("page_token_enc").notNull(),
    igAccountId: text("ig_account_id"),
    igUsername: text("ig_username"),
    leadsAssigneeId: uuid("leads_assignee_id").references(() => users.id, { onDelete: "set null" }),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("meta_pages_workspace_idx").on(t.workspaceId), index("meta_pages_ig_idx").on(t.igAccountId)],
);

export const metaAdAccounts = pgTable(
  "meta_ad_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    adAccountId: text("ad_account_id").notNull().unique(),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("DKK"),
    /** Kunden (virksomheden) annoncekontoen hører til – bruges i månedsrapporten. */
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("meta_ad_accounts_workspace_idx").on(t.workspaceId)],
);

/** Leads fra Meta Lead Ads. leadgen_id er unik, så samme lead aldrig importeres to gange. */
export const metaLeads = pgTable(
  "meta_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    leadgenId: text("leadgen_id").notNull().unique(),
    pageId: text("page_id").notNull(),
    formId: text("form_id"),
    adId: text("ad_id"),
    campaignId: text("campaign_id"),
    campaignName: text("campaign_name"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("meta_leads_workspace_campaign_idx").on(t.workspaceId, t.campaignId)],
);

/** Annonceforbrug pr. kampagne pr. dag. */
export const adInsights = pgTable(
  "ad_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    adAccountId: text("ad_account_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    campaignName: text("campaign_name").notNull(),
    date: date("date").notNull(),
    spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    metaLeads: integer("meta_leads").notNull().default(0),
  },
  (t) => [
    uniqueIndex("ad_insights_unique_idx").on(t.adAccountId, t.campaignId, t.date),
    index("ad_insights_workspace_date_idx").on(t.workspaceId, t.date),
  ],
);

export const platformEnum = pgEnum("message_platform", ["MESSENGER", "INSTAGRAM"]);
export type Platform = (typeof platformEnum.enumValues)[number];

/** En samtale med én person på Messenger eller Instagram. */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    metaPageId: uuid("meta_page_id")
      .notNull()
      .references(() => metaPages.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    /** PSID (Messenger) eller IGSID (Instagram) for personen, der skriver. */
    externalUserId: text("external_user_id").notNull(),
    name: text("name"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    /** Første ubesvarede besked fra kunden; nulstilles når der svares (også fra Meta Business Suite). */
    awaitingSince: timestamp("awaiting_since", { withTimezone: true }),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conversations_page_user_idx").on(t.metaPageId, t.platform, t.externalUserId),
    index("conversations_workspace_last_idx").on(t.workspaceId, t.lastMessageAt),
  ],
);

export const messageDirectionEnum = pgEnum("message_direction", ["IN", "OUT"]);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    text: text("text"),
    attachments: jsonb("attachments"),
    /** Metas besked-id (mid). Unikt, så webhooks der kommer to gange ikke giver dubletter. */
    externalId: text("external_id").unique(),
    sentById: uuid("sent_by_id").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.sentAt)],
);

/** Mislykkede loginforsøg, så gentagne gæt på adgangskoder kan blokeres midlertidigt. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_idx").on(t.email, t.createdAt), index("login_attempts_ip_idx").on(t.ipHash, t.createdAt)],
);

export const authTokenPurposeEnum = pgEnum("auth_token_purpose", ["RESET", "INVITE"]);

/** Engangslinks til nulstilling af adgangskode og invitationer. Kun en SHA-256-hash gemmes. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: authTokenPurposeEnum("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId, t.createdAt)],
);

export const responseChannelEnum = pgEnum("response_channel", ["LEAD", "MESSENGER", "INSTAGRAM"]);

/** Én række pr. besvaret henvendelse – bruges til at måle svartid. */
export const responseLog = pgTable(
  "response_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    channel: responseChannelEnum("channel").notNull(),
    seconds: integer("seconds").notNull(),
    respondedById: uuid("responded_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("response_log_workspace_idx").on(t.workspaceId, t.createdAt)],
);

export const notificationTypeEnum = pgEnum("notification_type", [
  "NEW_LEAD",
  "NEW_CONVERSATION",
  "TASK_ASSIGNED",
  "DEAL_WON",
  "MEMBER_ADDED",
  "QUOTE_VIEWED",
  "QUOTE_ACCEPTED",
  "QUOTE_DECLINED",
  "NEW_BOOKING",
  "BOOKING_CANCELLED",
  "RETAINER_ALERT",
]);
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

export const automationTypeEnum = pgEnum("automation_type", ["STALE_LEAD", "PROPOSAL_FOLLOWUP", "CLOSE_DATE_PASSED"]);
export type AutomationType = (typeof automationTypeEnum.enumValues)[number];

/** Automatiske opfølgningsregler pr. firma. Mangler en række, gælder standardindstillingen. */
export const automationRules = pgTable(
  "automation_rules",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: automationTypeEnum("type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    days: integer("days").notNull().default(3),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.type] })],
);

export const customFieldEntityEnum = pgEnum("custom_field_entity", ["CONTACT", "COMPANY", "DEAL"]);
export type CustomFieldEntity = (typeof customFieldEntityEnum.enumValues)[number];
export const customFieldTypeEnum = pgEnum("custom_field_type", ["TEXT", "NUMBER", "DATE", "SELECT", "CHECKBOX"]);
export type CustomFieldType = (typeof customFieldTypeEnum.enumValues)[number];

/** Firmaets egne felter. Værdierne ligger i kolonnen `custom` på kontakter, virksomheder og deals. */
export const customFields = pgTable(
  "custom_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entity: customFieldEntityEnum("entity").notNull(),
    label: text("label").notNull(),
    type: customFieldTypeEnum("type").notNull().default("TEXT"),
    /** Valgmuligheder for typen SELECT. */
    options: jsonb("options").$type<string[]>().notNull().default([]),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("custom_fields_workspace_idx").on(t.workspaceId, t.entity, t.position)],
);

export const quoteStatusEnum = pgEnum("quote_status", ["DRAFT", "SENT", "ACCEPTED", "DECLINED"]);
export type QuoteStatus = (typeof quoteStatusEnum.enumValues)[number];

/** Et tilbud på en deal. Kunden ser og accepterer det via et hemmeligt link (token). */
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    intro: text("intro"),
    terms: text("terms"),
    status: quoteStatusEnum("status").notNull().default("DRAFT"),
    validUntil: date("valid_until"),
    /** Momssats i procent (25 eller 0). */
    vatRate: integer("vat_rate").notNull().default(25),
    token: text("token").notNull().unique(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedName: text("accepted_name"),
    acceptedIpHash: text("accepted_ip_hash"),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    declineReason: text("decline_reason"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("quotes_workspace_number_idx").on(t.workspaceId, t.number),
    index("quotes_deal_idx").on(t.dealId),
  ],
);

/** En linje på et tilbud. Priser i øre, ekskl. moms. */
export const quoteLines = pgTable(
  "quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
    unit: text("unit"),
    unitPriceOre: integer("unit_price_ore").notNull().default(0),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  },
  (t) => [index("quote_lines_quote_idx").on(t.quoteId, t.position)],
);

export const reviewRequestStatusEnum = pgEnum("review_request_status", [
  "SCHEDULED",
  "SENT",
  "CLICKED",
  "SKIPPED",
]);
export type ReviewRequestStatus = (typeof reviewRequestStatusEnum.enumValues)[number];

/** Anmodning om en anmeldelse, planlagt når en deal vindes og sendt af den daglige kørsel. */
export const reviewRequests = pgTable(
  "review_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    status: reviewRequestStatusEnum("status").notNull().default("SCHEDULED"),
    /** Hemmeligt id i linkene i e-mailen (klik og afmelding). */
    token: text("token").notNull().unique(),
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    skipReason: text("skip_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_requests_due_idx").on(t.status, t.sendAt),
    index("review_requests_workspace_idx").on(t.workspaceId, t.createdAt),
    index("review_requests_contact_idx").on(t.contactId),
  ],
);

/** Åbningstid for én ugedag (mandag = indeks 0). Tider som "08:00". */
export type OpeningDay = { open: boolean; from: string; to: string };

/** Regler for onlinebooking pr. firma. */
export const bookingSettings = pgTable("booking_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  /** Den offentlige del af bookinglinket (/book/<key>). */
  key: text("key").notNull().unique(),
  openingHours: jsonb("opening_hours").$type<OpeningDay[]>().notNull(),
  /** Hvor tæt de ledige tider ligger, i minutter. */
  slotMinutes: integer("slot_minutes").notNull().default(30),
  /** Antal bookinger der kan foregå samtidig (fx antal pladser i hallen). */
  capacity: integer("capacity").notNull().default(1),
  /** Hvor mange timer i forvejen kunden senest kan booke. */
  minNoticeHours: integer("min_notice_hours").notNull().default(12),
  /** Hvor mange dage frem kunden kan booke. */
  maxDaysAhead: integer("max_days_ahead").notNull().default(30),
  /** Hvor mange timer før kunden selv kan aflyse via linket. */
  cancelHours: integer("cancel_hours").notNull().default(24),
  /** Tekst øverst på bookingsiden. */
  intro: text("intro"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** En ydelse, der kan bookes (fx "Indvendig rens"). Pris i øre inkl. moms. */
export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    priceOre: integer("price_ore").notNull().default(0),
    /** Påmind kunden om en ny behandling efter så mange måneder. Null = ingen påmindelse. */
    reminderMonths: integer("reminder_months"),
    bookableOnline: boolean("bookable_online").notNull().default(true),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("services_workspace_idx").on(t.workspaceId, t.position)],
);

/** En bil, der tilhører en kontakt. Nummerpladen gemmes uden mellemrum med store bogstaver. */
export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    plate: text("plate"),
    make: text("make"),
    model: text("model"),
    year: integer("year"),
    color: text("color"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("vehicles_workspace_plate_idx").on(t.workspaceId, t.plate),
    index("vehicles_contact_idx").on(t.contactId),
  ],
);

export const bookingStatusEnum = pgEnum("booking_status", ["CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]);
export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];
export const bookingSourceEnum = pgEnum("booking_source", ["ONLINE", "MANUAL"]);

/** En booket tid. Ydelsens navn og pris kopieres, så ændringer i prislisten ikke ændrer historikken. */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    serviceName: text("service_name").notNull(),
    priceOre: integer("price_ore").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: bookingStatusEnum("status").notNull().default("CONFIRMED"),
    source: bookingSourceEnum("source").notNull().default("MANUAL"),
    /** Kundens besked ved onlinebooking. */
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    /** Hemmeligt id i kundens aflysningslink. */
    token: text("token").notNull().unique(),
    ipHash: text("ip_hash"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    /** Sat når kunden er mindet om en ny behandling (ydelsens påmindelsesinterval). */
    serviceReminderSentAt: timestamp("service_reminder_sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("bookings_workspace_start_idx").on(t.workspaceId, t.startsAt),
    index("bookings_contact_idx").on(t.contactId),
    index("bookings_status_start_idx").on(t.status, t.startsAt),
  ],
);

/** Registreret tid. Et kørende stopur har endedAt = null. */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Kunden tiden er brugt på. Null = intern tid. */
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    description: text("description"),
    /** Dansk dato, tiden hører til (bruges til uger og måneder). */
    date: date("date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    minutes: integer("minutes").notNull().default(0),
    billable: boolean("billable").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("time_entries_workspace_date_idx").on(t.workspaceId, t.date),
    index("time_entries_company_date_idx").on(t.companyId, t.date),
    index("time_entries_user_idx").on(t.userId, t.date),
  ],
);

/** Fast månedlig aftale med en kunde: timebudget og/eller pris pr. måned. */
export const retainers = pgTable(
  "retainers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Timebudget pr. måned i minutter. */
    monthlyMinutes: integer("monthly_minutes").notNull(),
    /** Pris pr. måned i øre (valgfri). */
    monthlyPriceOre: integer("monthly_price_ore"),
    /** Timepris for timer ud over budgettet, i øre (valgfri). */
    hourlyRateOre: integer("hourly_rate_ore"),
    active: boolean("active").notNull().default(true),
    /** Seneste måned ("YYYY-MM"), der er advaret om ved 80 % og 100 %. */
    alerted80: text("alerted_80"),
    alerted100: text("alerted_100"),
    ...timestamps,
  },
  (t) => [uniqueIndex("retainers_company_idx").on(t.workspaceId, t.companyId)],
);

export const projectStatusEnum = pgEnum("project_status", ["ACTIVE", "DONE"]);

/** Et projekt for en kunde (fx "Ny hjemmeside"). Opgaverne ligger i tasks med projectId. */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    status: projectStatusEnum("status").notNull().default("ACTIVE"),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("projects_workspace_idx").on(t.workspaceId, t.status)],
);

export type TemplateItem = { title: string; offsetDays: number };

/** Skabelon med faste opgaver, fx "Onboarding af ny kunde". */
export const projectTemplates = pgTable(
  "project_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    items: jsonb("items").$type<TemplateItem[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_templates_workspace_idx").on(t.workspaceId)],
);

/** Log over vigtige handlinger i firmaet (sletninger, eksporter, indstillinger, adgang). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_workspace_idx").on(t.workspaceId, t.createdAt)],
);

/** Svarskabeloner til indbakken (Messenger/Instagram). */
export const savedReplies = pgTable(
  "saved_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("saved_replies_workspace_idx").on(t.workspaceId, t.position)],
);
