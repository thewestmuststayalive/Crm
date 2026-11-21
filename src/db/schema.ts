import {
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
    ...timestamps,
  },
  (t) => [
    index("contacts_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("contacts_company_idx").on(t.companyId),
  ],
);

export const dealStageEnum = pgEnum("deal_stage", ["NEW", "CONTACTED", "PROPOSAL", "WON", "LOST"]);
export type DealStage = (typeof dealStageEnum.enumValues)[number];

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
    stage: dealStageEnum("stage").notNull().default("NEW"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    source: leadSourceEnum("source").notNull().default("MANUAL"),
    expectedCloseDate: date("expected_close_date"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    ...timestamps,
  },
  (t) => [
    index("deals_workspace_stage_idx").on(t.workspaceId, t.stage),
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
