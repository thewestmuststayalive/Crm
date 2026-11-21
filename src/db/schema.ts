import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
