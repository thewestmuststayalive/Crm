import {
  index,
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

export const activityTypeEnum = pgEnum("activity_type", ["NOTE", "CALL", "EMAIL", "MEETING"]);
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

/** Tidslinje: noter, opkald, e-mails og møder på en kontakt eller virksomhed. */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    type: activityTypeEnum("type").notNull().default("NOTE"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activities_contact_idx").on(t.contactId, t.createdAt),
    index("activities_company_idx").on(t.companyId, t.createdAt),
    index("activities_workspace_idx").on(t.workspaceId, t.createdAt),
  ],
);
