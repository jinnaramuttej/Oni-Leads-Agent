"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchNextLeadAction, updateLeadStatusAction } from "./actions";

// --- Types ---
type Lead = {
  id: string;
  business_name: string;
  category: string;
  city_area: string;
  google_rating: string;
  review_count: string;
  draft_message: string;
  wa_link: string;
  lead_status: string;
};

interface HistoryEntry {
  action: "sent" | "skip" | "notInterested" | "invalidNumber";
  lead: Lead;
  sentDeltas: number;
}

const ACTION_HINT = "Enter to send \u00b7 S to skip";
const LEAD_STATUS = {
  DRAFT_READY: "draft_ready",
  CONTACTED: "contacted",
  NOT_INTERESTED: "not_interested",
  INVALID_NUMBER: "invalid_number",
};

type LoadingState = "idle" | "loading" | "ready" | "empty" | "error";

// --- Components ---

function formatRating(lead: Lead): string | null {
  if (lead.google_rating == null) return null;
  return `${Number(lead.google_rating).toFixed(1)} stars`;
}

function formatReviews(lead: Lead): string | null {
  if (lead.review_count == null) return null;
  return `${lead.review_count} reviews`;
}

function normalizeCategory(cat: string | null): string | null {
  return cat && cat.trim().length > 0 ? cat.replace(/_/g, " ") : null;
}

function LeadMeta({ lead }: { lead: Lead }) {
  const items = [
    normalizeCategory(lead.category),
    lead.city_area,
    formatRating(lead),
    formatReviews(lead),
  ].filter((v): v is string => Boolean(v));

  return (
    <p className="font-mono text-[13px] leading-none tracking-tight text-neutral-500">
      {items.length > 0 ? (
        items.map((item, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-2 text-neutral-300">|</span>}
            {item}
          </span>
        ))
      ) : (
        <span>No listing data available</span>
      )}
    </p>
  );
}

function DraftMessage({ message }: { message: string | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.25em] text-neutral-500">
          Draft message
        </h2>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!message}
          className="cursor-pointer border-b border-transparent font-mono text-[11px] font-medium uppercase tracking-[0.25em] text-neutral-500 transition-colors hover:border-neutral-400 hover:text-black disabled:cursor-not-allowed"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="relative overflow-x-auto whitespace-pre-wrap break-words border border-black bg-white px-6 py-6 font-mono text-[14px] leading-relaxed text-black">
        {message ? (
          message
        ) : (
          <span className="text-neutral-400">No draft message on file.</span>
        )}
      </pre>
    </section>
  );
}

function ActionBar({
  lead,
  loading,
  hint,
  onOpenWhatsApp,
  onMarkSent,
  onSkip,
  onNotInterested,
  onInvalidNumber,
}: {
  lead: Lead;
  loading: boolean;
  hint?: string;
  onOpenWhatsApp: () => void;
  onMarkSent: () => void;
  onSkip: () => void;
  onNotInterested: () => void;
  onInvalidNumber: () => void;
}) {
  const canOpen = Boolean(lead.wa_link);

  const ghostClass =
    "cursor-pointer border-b border-transparent text-[13px] font-medium tracking-wide text-neutral-500 transition-colors hover:border-neutral-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onOpenWhatsApp}
          disabled={!canOpen || loading}
          className="h-[52px] cursor-pointer rounded-none bg-black text-[14px] font-semibold tracking-wide text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:opacity-30"
        >
          {canOpen ? "Open WhatsApp" : "No WhatsApp link"}
        </button>
        <button
          type="button"
          onClick={onMarkSent}
          disabled={loading}
          className="h-[52px] cursor-pointer rounded-none border border-black bg-white text-[14px] font-semibold tracking-wide text-black transition-colors hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Loading" : "Mark as Sent & Next"}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={onNotInterested}
            disabled={loading}
            className={ghostClass}
          >
            Not Interested
          </button>
          <button
            type="button"
            onClick={onInvalidNumber}
            disabled={loading}
            className={ghostClass}
          >
            Invalid Number
          </button>
        </div>

        <button
          type="button"
          onClick={onSkip}
          disabled={loading}
          className={ghostClass}
        >
          Skip
        </button>
      </div>

      {hint && (
        <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-[0.25em] text-neutral-500">
          {hint}
        </p>
      )}
    </div>
  );
}

function Sidebar({
  sentCount,
  remaining,
  totalSent,
  canUndo,
  onUndo,
}: {
  sentCount: number;
  remaining: number | null;
  totalSent: number;
  canUndo: boolean;
  onUndo: () => void;
}) {
  return (
    <aside className="flex h-[calc(100vh-2px)] w-full flex-col justify-between border-r border-black bg-[#f3f2ef] px-6 py-6">
      <div className="space-y-10">
        <div>
          <p className="text-[13px] font-semibold tracking-[0.35em] text-black uppercase">
            Oni
          </p>
          <p className="mt-1 font-mono text-[11px] tracking-tight text-neutral-400">
            Outreach console
          </p>
        </div>

        <nav className="space-y-1 font-mono text-[13px] tracking-tight text-neutral-500">
          <p className="cursor-default">Queue</p>
          <p className="border-l-2 border-black pl-3 font-medium text-black">
            Inbox
          </p>
        </nav>
      </div>

      <div className="space-y-1 font-mono text-[12.5px] leading-relaxed tracking-tight text-black">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-neutral-400">Sent</span>
          <span>{sentCount}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-neutral-400">Remaining</span>
          <span>{remaining === null ? "\u2013" : remaining}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-neutral-400">Sent all time</span>
          <span>{totalSent}</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1">
          <span className="text-neutral-400">Undo</span>
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="cursor-pointer border-b border-transparent text-[12px] text-neutral-500 transition-colors hover:border-neutral-400 hover:text-black disabled:cursor-not-allowed"
          >
            Undo last action
          </button>
        </div>
      </div>
    </aside>
  );
}

function EmptyState({ sentCount }: { sentCount: number }) {
  return (
    <div className="border border-black bg-white px-10 py-16 text-center">
      <h2 className="text-[22px] font-semibold tracking-tight text-black">
        Queue complete
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-neutral-600">
        There are no remaining leads matching the current filter. Any new leads
        added with a status of draft_ready and a WhatsApp link will appear here
        automatically.
      </p>
      <p className="mt-6 font-mono text-[12.5px] tracking-tight text-neutral-500">
        {sentCount} sent this session
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border border-black bg-white px-10 py-14">
      <h2 className="text-[22px] font-semibold tracking-tight text-black">
        Unable to load leads
      </h2>
      <p className="mt-3 max-w-lg font-mono text-[13px] leading-relaxed text-neutral-600">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 h-[44px] cursor-pointer rounded-none border border-black bg-white px-8 text-[14px] font-semibold tracking-wide text-black hover:bg-black hover:text-white"
      >
        Retry
      </button>
    </div>
  );
}

// --- Main Page ---

export default function OutreachDashboard() {
  const [lead, setLead] = useState<Lead | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [totalSent, setTotalSent] = useState(0);
  const [status, setStatus] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [skipIds, setSkipIds] = useState<string[]>([]);

  const inFlightRef = useRef(false);

  const loadLead = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const data = await fetchNextLeadAction(skipIds);
      setRemaining(data.remaining);
      if (data.totalSent !== undefined) {
        setTotalSent(data.totalSent);
      }
      if (data.lead) {
        setLead(data.lead as Lead);
        setStatus("ready");
      } else {
        setLead(null);
        setStatus("empty");
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }, [skipIds]);

  useEffect(() => {
    loadLead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipIds]);

  const advance = useCallback(async () => {
    inFlightRef.current = true;
    setBusy(true);
    await loadLead();
    setBusy(false);
    inFlightRef.current = false;
  }, [loadLead]);

  const applyStatus = useCallback(
    async (
      action: HistoryEntry["action"],
      targetStatus: string,
      before: Lead | null
    ) => {
      if (!before || busy || inFlightRef.current) return;
      setBusy(true);
      try {
        if (action === "skip") {
          setSkipIds((prev) => [...prev, before.id]);
        } else {
          await updateLeadStatusAction(before.id, targetStatus);
        }
        
        const sentDeltas = action === "sent" ? 1 : 0;
        if (sentDeltas) {
          setSentCount((c) => c + sentDeltas);
          setTotalSent((c) => c + sentDeltas);
        }
        
        setHistory((h) => [{ action, lead: before, sentDeltas }, ...h].slice(0, 25));
        
        if (action !== "skip") {
          await advance();
        }
        // If skip, changing skipIds will automatically trigger useEffect to reload
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
        setBusy(false);
      }
      // Note: we don't clear busy in a finally block here because if action === "skip",
      // the useEffect will trigger loadLead() which will clear busy when it finishes.
      // If we cleared it here, the UI would briefly flash enabled before the next lead loads.
      if (action !== "skip") {
        setBusy(false);
      }
    },
    [busy, advance]
  );

  const handleOpenWhatsApp = useCallback(() => {
    if (lead?.wa_link) {
      // The DB's wa_link might have an outdated ?text= parameter.
      // We extract just the base URL (https://wa.me/PHONE) and append the exact draft_message.
      const baseUrl = lead.wa_link.split('?')[0];
      const textParam = lead.draft_message ? `?text=${encodeURIComponent(lead.draft_message)}` : '';
      window.open(`${baseUrl}${textParam}`, "_blank", "noopener,noreferrer");
    }
  }, [lead]);

  const handleMarkSent = useCallback(() => {
    return applyStatus("sent", LEAD_STATUS.CONTACTED, lead);
  }, [applyStatus, lead]);

  const handleSkip = useCallback(() => {
    return applyStatus("skip", LEAD_STATUS.DRAFT_READY, lead);
  }, [applyStatus, lead]);

  const handleNotInterested = useCallback(() => {
    return applyStatus("notInterested", LEAD_STATUS.NOT_INTERESTED, lead);
  }, [applyStatus, lead]);

  const handleInvalidNumber = useCallback(() => {
    return applyStatus("invalidNumber", LEAD_STATUS.INVALID_NUMBER, lead);
  }, [applyStatus, lead]);

  const handleUndo = useCallback(async () => {
    if (busy || inFlightRef.current) return;
    const last = history[0];
    if (!last) return;
    
    setBusy(true);
    setHistory((h) => h.slice(1));
    
    try {
      if (last.action === "skip") {
        setSkipIds((prev) => prev.filter(id => id !== last.lead.id));
      } else {
        // Revert status to draft_ready in DB
        await updateLeadStatusAction(last.lead.id, LEAD_STATUS.DRAFT_READY);
      }
      
      if (last.sentDeltas > 0) {
        setSentCount((c) => Math.max(0, c - last.sentDeltas));
        setTotalSent((c) => Math.max(0, c - last.sentDeltas));
      }
      
      // Put the restored lead back in view
      setLead({ ...last.lead, lead_status: LEAD_STATUS.DRAFT_READY });
      setStatus("ready");
      setError(null);
      // We manually update remaining count +1 if it wasn't a skip (since it's now back in draft_ready queue)
      if (last.action !== "skip" && remaining !== null) {
        setRemaining(remaining + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }, [history, busy, remaining]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.tagName === "BUTTON") {
        return; 
      }
      const key = e.key.toLowerCase();
      if (key === "enter") {
        e.preventDefault();
        handleMarkSent();
      } else if (key === "s") {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleMarkSent, handleSkip]);

  const denominator = totalSent + (remaining ?? 0);
  const progressPct =
    denominator > 0 ? Math.min(100, (totalSent / denominator) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#f3f2ef] font-sans text-[#111110]">
      <div className="h-[2px] w-full bg-[#e4e2dd]">
        <div
          className="h-full bg-black transition-[width] duration-200 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex min-h-[calc(100vh-2px)]">
        <div className="hidden w-56 shrink-0 border-r border-black md:block">
          <Sidebar
            sentCount={sentCount}
            remaining={remaining !== null ? remaining - skipIds.length : null}
            totalSent={totalSent}
            canUndo={history.length > 0}
            onUndo={handleUndo}
          />
        </div>

        <main className="min-w-0 flex-1 px-6 pt-6 pb-20 md:px-10 md:pt-10">
          <div className="mb-8 flex items-baseline justify-between border-b border-neutral-300 pb-4 md:hidden">
            <span className="text-[13px] font-semibold tracking-[0.35em] text-black uppercase">
              Oni
            </span>
            <span className="font-mono text-[12.5px] leading-none tracking-tight text-black">
              {sentCount} sent&nbsp;&nbsp;|&nbsp;&nbsp;{remaining === null ? "\u2013" : remaining - skipIds.length} left
            </span>
          </div>

          {status === "error" && lead == null ? (
            <ErrorState message={error ?? "Unknown error"} onRetry={() => loadLead()} />
          ) : status === "empty" ? (
            <EmptyState sentCount={sentCount} />
          ) : (status === "loading" || status === "idle") && lead == null ? (
            <div className="border border-black bg-white px-10 py-16 text-center">
              <h2 className="text-[18px] font-semibold tracking-tight text-black">
                Loading lead
              </h2>
            </div>
          ) : lead ? (
            <div className="flex flex-col gap-10">
              {status === "error" && (
                <div className="border border-black bg-white px-6 py-4">
                  <p className="font-mono text-[12.5px] leading-relaxed text-black">
                    {error}
                  </p>
                </div>
              )}
              <section>
                <label className="mb-3 block font-mono text-[11px] font-medium uppercase tracking-[0.25em] text-neutral-500">
                  Business
                </label>
                <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-black sm:text-5xl">
                  {lead.business_name}
                </h1>
                <div className="mt-4">
                  <LeadMeta lead={lead} />
                </div>
              </section>

              <DraftMessage message={lead.draft_message} />

              <ActionBar
                lead={lead}
                loading={busy}
                hint={ACTION_HINT}
                onOpenWhatsApp={handleOpenWhatsApp}
                onMarkSent={handleMarkSent}
                onSkip={handleSkip}
                onNotInterested={handleNotInterested}
                onInvalidNumber={handleInvalidNumber}
              />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
