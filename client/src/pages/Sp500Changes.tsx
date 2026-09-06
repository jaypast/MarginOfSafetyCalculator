import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";

interface Snapshot {
  status: "complete" | "incomplete" | "error";
  evaluatedAt: string;
  price: number | null;
  intrinsicValue: number | null;
  discountPct: number | null;
  marginOfSafetyPct: number | null;
  quality: string | null;
  meetsBuyCriteria: boolean;
  reason: string;
  dataSource: string;
  fetchedAt: string | null;
  dataWarnings: string[];
}
interface Change {
  id: number;
  effectiveDate: string;
  announcementDate: string | null;
  changeType: "addition" | "deletion";
  symbol: string;
  companyName: string;
  membershipSource: string;
  snapshot: Snapshot;
  evaluationRevision: {
    calculationVersion: number;
    revised: boolean;
    originalEvaluatedAt: string;
  };
}
interface ChangesResponse {
  quarters: Array<{ quarter: string; changes: Change[] }>;
  lastCheckedAt: string | null;
  update: { newCount: number; checked: boolean; error?: string };
}

const dateLabel = (date: string | null) =>
  date ? new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Not provided";

function ChangeCard({ change }: { change: Change }) {
  const s = change.snapshot;
  return (
    <Link href={`/?symbol=${encodeURIComponent(change.symbol)}`} className="block">
      <article className="rounded-lg border bg-white p-4 hover:border-slate-400 hover:shadow-sm transition-all" data-testid={`sp500-change-${change.symbol}-${change.changeType}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#1A2942]">{change.symbol}</span>
              <Badge className={change.changeType === "addition" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-rose-100 text-rose-800 hover:bg-rose-100"}>
                {change.changeType === "addition" ? "Added" : "Removed"}
              </Badge>
            </div>
            <p className="text-sm text-neutral-600 truncate mt-1" title={change.companyName}>{change.companyName}</p>
          </div>
          <Badge variant="outline" className={s.meetsBuyCriteria ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-neutral-300 bg-neutral-50 text-neutral-700"}>
            {s.meetsBuyCriteria ? "Meets buy criteria" : "Does not meet"}
          </Badge>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
          <div><dt className="text-neutral-500">Price</dt><dd className="font-medium">{s.price == null ? "—" : formatCurrency(s.price)}</dd></div>
          <div><dt className="text-neutral-500">Intrinsic value</dt><dd className="font-medium">{s.intrinsicValue == null ? "—" : formatCurrency(s.intrinsicValue)}</dd></div>
          <div><dt className="text-neutral-500">Margin of safety</dt><dd className="font-medium">{s.marginOfSafetyPct == null ? "—" : `${s.marginOfSafetyPct.toFixed(1)}%`}</dd></div>
          <div><dt className="text-neutral-500">Quality</dt><dd className="font-medium">{s.quality ?? "Unavailable"}</dd></div>
        </dl>
        <p className="mt-3 text-sm text-neutral-700">{s.reason}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
          <span>Effective {dateLabel(change.effectiveDate)}</span>
          {change.announcementDate && <span>Announced {dateLabel(change.announcementDate)}</span>}
          <span>{change.evaluationRevision.revised ? "Revised" : "Evaluated"} {dateLabel(s.evaluatedAt.slice(0, 10))}</span>
          <span>Calculation v{change.evaluationRevision.calculationVersion}</span>
          {change.evaluationRevision.revised && (
            <span>Original evaluation {dateLabel(change.evaluationRevision.originalEvaluatedAt.slice(0, 10))}</span>
          )}
          <span>Source: {s.dataSource}</span>
          <span>Index record: {change.membershipSource}</span>
        </div>
        {s.dataWarnings.length > 0 && (
          <p className="mt-2 flex items-start gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {s.dataWarnings.join(" · ")}
          </p>
        )}
      </article>
    </Link>
  );
}

export default function Sp500Changes() {
  const { toast } = useToast();
  const [data, setData] = useState<ChangesResponse | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const res = await fetch(force ? "/api/sp500/changes/refresh" : "/api/sp500/changes", { method: force ? "POST" : "GET" });
      if (!res.ok) throw new Error("Could not load S&P 500 changes");
      const next: ChangesResponse = await res.json();
      setData(next);
      setSelected(current => current || next.quarters[0]?.quarter || "");
      if (force) {
        trackEvent('sp500_check_requested', {
          outcome: next.update.error ? 'error' : 'success',
          new_count: next.update.newCount,
          location: 'sp500_changes',
        });
      }
      if (next.update.error) setError(next.update.error);
      else if (force) {
        toast({ title: next.update.newCount ? `${next.update.newCount} changes just added` : "S&P 500 changes are up to date" });
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Refresh failed"); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { void load(); }, []);
  const quarter = data?.quarters.find(q => q.quarter === selected);
  const additions = quarter?.changes.filter(c => c.changeType === "addition") ?? [];
  const deletions = quarter?.changes.filter(c => c.changeType === "deletion") ?? [];

  return (
    <main className="container mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#1A2942] flex items-center gap-2"><CalendarDays className="h-7 w-7" /> S&P 500 Changes</h1>
          <p className="text-neutral-600 mt-1">Additions and removals evaluated against the app’s research buy screen.</p>
        </div>
        <div className="flex items-center gap-2">
          {data?.quarters.length ? (
            <select aria-label="Quarter" value={selected} onChange={e => {
              setSelected(e.target.value);
              trackEvent('sp500_quarter_selected', { quarter: e.target.value, location: 'sp500_changes' });
            }} className="h-9 rounded-md border bg-white px-3 text-sm">
              {data.quarters.map(q => <option key={q.quarter}>{q.quarter}</option>)}
            </select>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Checking…" : "Check now"}
          </Button>
        </div>
      </header>

      {error && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>}
      {loading ? <div className="py-20 flex justify-center text-neutral-500"><Loader2 className="animate-spin mr-2" /> Loading changes…</div>
      : !quarter ? <Card><CardContent className="py-16 text-center"><p className="font-medium">No S&P 500 changes have been captured yet.</p><p className="text-sm text-neutral-500 mt-1">Use Check now to retrieve the latest constituent history.</p></CardContent></Card>
      : <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-emerald-800"><ArrowUpRight /> Additions <Badge variant="secondary">{additions.length}</Badge></CardTitle><CardDescription>Companies entering the S&P 500</CardDescription></CardHeader>
            <CardContent className="space-y-3">{additions.length ? additions.map(c => <ChangeCard key={c.id} change={c} />) : <p className="text-sm text-neutral-500">No additions recorded this quarter.</p>}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-rose-800"><ArrowDownRight /> Removals <Badge variant="secondary">{deletions.length}</Badge></CardTitle><CardDescription>Companies leaving the S&P 500</CardDescription></CardHeader>
            <CardContent className="space-y-3">{deletions.length ? deletions.map(c => <ChangeCard key={c.id} change={c} />) : <p className="text-sm text-neutral-500">No removals recorded this quarter.</p>}</CardContent>
          </Card>
        </div>}
      <div className="mt-5 text-xs text-neutral-500 space-y-1">
        <p>Qualifying screen: Good or Exceptional business quality and at least 10% below estimated intrinsic value, with no unresolved data-quality warning.</p>
        <p>The app checks for constituent updates once daily. Snapshots reflect data available when processed, not reconstructed historical fundamentals. Index inclusion is not a buy recommendation.</p>
      </div>
    </main>
  );
}