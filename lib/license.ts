// CLIENT-SAFE pure helpers + shared constants for the SaaS licensing system.
// No supabaseAdmin import here on purpose — see lib/fx.ts for why this split matters.

export interface LicenseFields {
  is_admin?: boolean | null;
  license_type?: "trial" | "permanent" | null;
  license_expires_at?: string | null;
  license_allowed_pages?: string[] | null;
  license_redeemed_at?: string | null;
}

// the checkbox list shown in /admin when generating or editing a license —
// every "feature page" a customer's account could be restricted out of.
export const PAGE_KEYS = ["dashboard", "add", "accounts", "people", "planning", "categories", "calendar"] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export const PAGE_LABELS: Record<PageKey, string> = {
  dashboard: "الرئيسية",
  add: "إضافة مصروف/دخل",
  accounts: "الحسابات",
  people: "الأشخاص والديون",
  planning: "التخطيط المالي (متكرر، ميزانية، أهداف، زكاة)",
  categories: "التصنيفات",
  calendar: "التقويم",
};

export type LicenseStatus =
  | { kind: "admin" } // exempt from all licensing checks
  | { kind: "unmanaged" } // no license ever assigned (pre-licensing / grandfathered account) — full access, no licensing UI shown
  | { kind: "unredeemed" } // code generated but customer hasn't activated it yet — shouldn't normally have an active session
  | { kind: "expired"; expiredAt: string | null } // trial or permanent ran out (or was deleted → forced-expired)
  | { kind: "active"; type: "trial" | "permanent"; allowedPages: PageKey[]; expiresAt: string | null; daysLeft: number | null };

export function computeLicenseStatus(user: LicenseFields): LicenseStatus {
  if (user.is_admin) return { kind: "admin" };
  // no license was ever issued for this account (created before the
  // licensing system existed, or a family sub-account added directly by the
  // admin outside the code-redemption flow) — grandfathered with full
  // access rather than treated as blocked.
  if (!user.license_type) return { kind: "unmanaged" };
  if (!user.license_redeemed_at) return { kind: "unredeemed" };

  const expiresAt = user.license_expires_at;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    return { kind: "expired", expiredAt: expiresAt };
  }

  const daysLeft = expiresAt ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000) : null;
  const allowedPages = (user.license_allowed_pages || []).filter((p): p is PageKey => (PAGE_KEYS as readonly string[]).includes(p));
  return { kind: "active", type: user.license_type || "trial", allowedPages, expiresAt: expiresAt || null, daysLeft };
}

// how long a fully-expired/deleted account's data is kept before the purge
// cron permanently removes it — matches the "هنحفظ بياناتك 30 يوم" message.
export const RETENTION_DAYS = 30;

export function generateLicenseCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids read-aloud/typo ambiguity
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `IDEA-${suffix}`;
}
