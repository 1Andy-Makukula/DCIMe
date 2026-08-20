import type { EmployeeProfile } from "@/shared/context/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// Who to attribute a signature to.
//
// A signature exists to name a person. Writing a placeholder like
// "Administrator" into an attribution column is a signature attributed to
// nobody — worse than leaving it blank, because it reads as real.
//
// But refusing outright is wrong too: an account with no full_name still has a
// badge number and an email, both of which identify a real person. An earlier
// version required full_name and silently hid the countersign button whenever
// it was empty, so the feature simply vanished with no explanation.
//
// So: prefer the name, fall back to identifiers that are still real, and only
// give up when there is genuinely nothing to attribute to.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveSignerName(employee: EmployeeProfile | null | undefined): string {
  if (!employee) return "";
  const name = employee.full_name?.trim();
  if (name) return name;
  const badge = employee.employee_id?.trim();
  if (badge) return badge;
  const email = employee.email?.trim();
  if (email) return email;
  return "";
}

/** Why signing is unavailable, or null when it is available. */
export function signingBlockedReason(
  employee: EmployeeProfile | null | undefined
): string | null {
  if (!employee) return "You are not signed in.";
  if (!resolveSignerName(employee)) {
    return "Your profile has no name, badge ID or email, so a signature could not be attributed to anyone.";
  }
  return null;
}
