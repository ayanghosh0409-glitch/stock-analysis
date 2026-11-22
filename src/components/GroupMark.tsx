import type { GroupKey } from "@/lib/sectorPage";

const COLOUR: Record<GroupKey, string> = {
  strong: "var(--good)",
  moderate: "var(--good)",
  near: "var(--warn)",
  skip: "var(--bad)",
  na: "var(--muted)",
};

/**
 * A small shape for each screen group, drawn rather than typed so it looks the same everywhere. The shapes differ, not only the
 * colours: a full circle is Strong, a half circle Moderate, a dashed ring Near cut-off, an empty ring Skip and a dash Not rated.
 * It is decorative: the group's name is always written beside it.
 */
export default function GroupMark({ group }: { group: GroupKey }) {
  const c = COLOUR[group];
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
      {group === "na" ? (
        <path d="M2.5 6h7" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="6" cy="6" r="4.6" fill={group === "strong" ? c : "none"} stroke={c} strokeWidth="1.5" strokeDasharray={group === "near" ? "2.4 1.7" : undefined} />
          {group === "moderate" && <path d="M6 1.4a4.6 4.6 0 0 0 0 9.2z" fill={c} />}
        </>
      )}
    </svg>
  );
}
