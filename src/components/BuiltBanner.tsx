import { ROE_ONLY_NOTE } from "@/lib/builtSector";
import type { Sector } from "@/lib/types";

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : null);

/**
 * Where a built sector came from, who sees it and what it leaves out, above the same sector view the listed sectors get.
 * `share` is what happened when this visitor's build was offered to everyone: "saving", or the reason it was not kept.
 */
export default function BuiltBanner({ sector, share, onRemove }: { sector: Sector; share?: string; onRemove: () => void }) {
  const b = sector.built!;
  const roeOnly = sector.stocks.some((s) => s.roceNa);
  const shown = sector.stocks.length;
  const total = shown + b.skipped.length;
  const lead = (
    <>
      the {total} largest NSE companies by market cap in {b.kind} {b.yahooName}
      {b.parentSector ? ` (${b.parentSector})` : ""}. Yahoo has {b.total} NSE compan{b.total === 1 ? "y" : "ies"} there.
    </>
  );
  return (
    <section aria-label="About this sector" className="mb-4 rounded-xl border border-line bg-surface2 p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl space-y-1.5">
          {b.shared ? (
            <p>
              <span className="font-semibold">Shared with every visitor.</span> Built from Yahoo Finance {when(b.builtAt) ? `on ${when(b.builtAt)}` : ""}: {lead} Anyone who builds it again after a
              week replaces this copy.
            </p>
          ) : (
            <p>
              <span className="font-semibold">Built from Yahoo Finance:</span> {lead}{" "}
              {share === "saving" ? (
                <span role="status">Saving it for every visitor…</span>
              ) : share ? (
                <span>It is shown for this visit only: {share}</span>
              ) : (
                <span>It is shown for this visit only.</span>
              )}
            </p>
          )}
          <p className="text-muted">
            {b.skipped.length > 0 ? `${shown} of them could be screened. ` : ""}The industry figure is the median of these {shown}, not of the whole sector.
            {b.oldest ? ` Figures were fetched from Yahoo ${when(b.oldest)} or later and are kept for up to a week.` : ""}
          </p>
          {roeOnly && <p className="text-muted">{ROE_ONLY_NOTE}</p>}
          {b.skipped.length > 0 && (
            <p className="text-muted">
              Left out ({b.skipped.length}): {b.skipped.map((s) => `${s.name} (${s.reason.replace(/\.$/, "")})`).join("; ")}.
            </p>
          )}
        </div>
        {!b.shared && (
          <button type="button" onClick={onRemove} className="rounded-full border border-line bg-surface px-3 py-1 text-xs hover:bg-surface2">
            Remove this sector
          </button>
        )}
      </div>
    </section>
  );
}
