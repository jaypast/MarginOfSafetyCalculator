import React, { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FeedbackAdmin } from "@/components/FeedbackAdmin";
import CacheStats from "@/components/CacheStats";
import { Download, RefreshCw, Search, ShieldAlert, Users, Activity, Bookmark } from "lucide-react";
import type { AccountSummary } from "@/lib/types";

interface AdminAccount extends AccountSummary {
  watchlistCount: number;
}
interface AdminReport {
  range: { from: string; to: string };
  registrations: number;
  activeRegisteredUsers: number;
  currentRegisteredUsers: number;
  activity: Array<{ eventName: string; audience: "anonymous" | "registered"; total: number }>;
  popularStocks: Array<{ symbol: string; total: number }>;
  auditActions: number;
  system: { database: "healthy" | "unavailable"; marketDataHealth: string };
  definitions: Record<string, string>;
}
interface AuditItem {
  id: number;
  action: string;
  targetAccountId: number | null;
  details: Record<string, unknown>;
  createdAt: string;
  actorEmail: string | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const today = new Date().toISOString().slice(0, 10);
const thirtyDaysAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

const Admin: React.FC = () => {
  const { isLoaded, isSignedIn } = useUser();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [offset, setOffset] = useState(0);
  const [exportError, setExportError] = useState("");

  const accountQuery = useQuery<AccountSummary>({
    queryKey: ["/api/account"], enabled: Boolean(isSignedIn),
  });
  const isOwner = accountQuery.data?.role === "owner";
  const accountsQuery = useQuery<{ accounts: AdminAccount[]; total: number }>({
    queryKey: ["/api/admin/accounts", search, offset],
    queryFn: () => fetchJson(`/api/admin/accounts?search=${encodeURIComponent(search)}&offset=${offset}`),
    enabled: isOwner,
  });
  const reportQuery = useQuery<AdminReport>({
    queryKey: ["/api/admin/reports", from, to],
    queryFn: () => fetchJson(`/api/admin/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    enabled: isOwner && Boolean(from && to),
  });
  const auditQuery = useQuery<AuditItem[]>({
    queryKey: ["/api/admin/audit"], enabled: isOwner,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "active" | "suspended" }) =>
      apiRequest("PATCH", `/api/admin/accounts/${id}/status`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/audit"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/accounts/${id}`, { confirmation: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/audit"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
    },
  });

  const exportReport = async () => {
    try {
      setExportError("");
      const response = await fetch(`/api/admin/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { credentials: "include" });
      if (!response.ok) throw new Error("The activity report could not be exported.");
      downloadBlob(await response.blob(), "account-activity-report.csv");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The activity report could not be exported.");
    }
  };

  if (!isLoaded || (isSignedIn && accountQuery.isLoading)) {
    return <main className="mx-auto max-w-6xl p-8 text-slate-600">Loading owner dashboard…</main>;
  }
  if (!isSignedIn) {
    return <main className="mx-auto max-w-3xl p-8"><Alert><ShieldAlert className="h-4 w-4" /><AlertDescription>Sign in with your owner account to open site administration. <Link className="font-semibold underline" href="/sign-in">Sign in</Link></AlertDescription></Alert></main>;
  }
  if (!isOwner) {
    return <main className="mx-auto max-w-3xl p-8"><Alert><ShieldAlert className="h-4 w-4" /><AlertDescription>{accountQuery.error?.message || "This account does not have owner access."} <Link className="font-semibold underline" href="/">Return to the calculator</Link></AlertDescription></Alert></main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-800">Owner controls</p>
            <h1 className="mt-1 text-3xl font-bold text-[#1A2942]">Site administration</h1>
            <p className="mt-2 text-sm text-slate-600">Manage registered accounts, review usage, and monitor storage. The site remains free; billing is not enabled.</p>
          </div>
          <Link href="/" className="text-sm font-medium text-blue-800 underline underline-offset-2">Back to calculator</Link>
        </header>

        {(accountQuery.error || reportQuery.error || accountsQuery.error || statusMutation.error || deleteMutation.error) && (
          <Alert variant="destructive"><AlertDescription>
            {(accountQuery.error || reportQuery.error || accountsQuery.error || statusMutation.error || deleteMutation.error as Error)?.message}
          </AlertDescription></Alert>
        )}
        {exportError && <Alert variant="destructive"><AlertDescription>{exportError}</AlertDescription></Alert>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Account summary">
          <Metric title="Registered accounts" value={reportQuery.data?.currentRegisteredUsers ?? "—"} icon={<Users className="h-5 w-5" />} />
          <Metric title="New in selected dates" value={reportQuery.data?.registrations ?? "—"} icon={<Users className="h-5 w-5" />} />
          <Metric title="Active in selected dates" value={reportQuery.data?.activeRegisteredUsers ?? "—"} icon={<Activity className="h-5 w-5" />} />
          <Metric title="Database" value={reportQuery.data?.system.database ?? "Checking"} icon={<ShieldAlert className="h-5 w-5" />} />
        </section>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div><CardTitle>Usage reports</CardTitle><p className="mt-1 text-sm text-slate-600">Activity is collected from now forward; older usage is not reconstructed.</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-600">From (UTC) <Input className="mt-1 w-36" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="text-xs text-slate-600">To (UTC) <Input className="mt-1 w-36" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
              <Button variant="outline" className="mt-4" onClick={() => void reportQuery.refetch()} disabled={reportQuery.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
              <Button className="mt-4" onClick={() => void exportReport()}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="mb-3 font-semibold text-[#1A2942]">Activity events</h2>
              <div className="overflow-x-auto rounded-md border bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3">Event</th><th className="p-3">Audience</th><th className="p-3 text-right">Count</th></tr></thead>
                  <tbody>{reportQuery.data?.activity.length ? reportQuery.data.activity.map((item, i) => (
                    <tr key={`${item.eventName}-${item.audience}-${i}`} className="border-t"><td className="p-3">{item.eventName.replaceAll("_", " ")}</td><td className="p-3 capitalize">{item.audience}</td><td className="p-3 text-right tabular-nums">{item.total}</td></tr>
                  )) : <tr><td className="p-4 text-slate-500" colSpan={3}>{reportQuery.isLoading ? "Loading activity…" : "No recorded activity for these dates."}</td></tr>}</tbody>
                </table>
              </div>
            </div>
            <div>
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-[#1A2942]"><Bookmark className="h-4 w-4" />Most tracked stocks</h2>
              <div className="overflow-x-auto rounded-md border bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3">Symbol</th><th className="p-3 text-right">Current lists</th></tr></thead>
                  <tbody>{reportQuery.data?.popularStocks.length ? reportQuery.data.popularStocks.map((item) => (
                    <tr key={item.symbol} className="border-t"><td className="p-3 font-semibold">{item.symbol}</td><td className="p-3 text-right tabular-nums">{item.total}</td></tr>
                  )) : <tr><td className="p-4 text-slate-500" colSpan={2}>No saved stock lists yet.</td></tr>}</tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">{reportQuery.data?.definitions.popularStocks}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Accounts</CardTitle><p className="text-sm text-slate-600">Suspending an account blocks its next protected request. Deleting removes its saved stocks.</p></CardHeader>
          <CardContent>
            <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setOffset(0); }}>
              <div className="relative w-full max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} placeholder="Search by email" aria-label="Search accounts" /></div>
            </form>
            <div className="overflow-x-auto rounded-md border bg-white">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3">Email</th><th className="p-3">Joined</th><th className="p-3">Stocks</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
                <tbody>{accountsQuery.data?.accounts.length ? accountsQuery.data.accounts.map((user) => (
                  <tr key={user.id} className="border-t">
                    <td className="p-3">{user.email || "Email unavailable"}</td>
                    <td className="p-3">{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">{user.watchlistCount}</td>
                    <td className="p-3 capitalize">{user.role === "owner" ? "Owner" : user.status}</td>
                    <td className="p-3"><div className="flex flex-wrap gap-2">
                      {user.role !== "owner" && <>
                        <Button variant="outline" size="sm" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: user.id, status: user.status === "active" ? "suspended" : "active" })}>{user.status === "active" ? "Suspend" : "Reactivate"}</Button>
                        <Button variant="destructive" size="sm" disabled={deleteMutation.isPending} onClick={() => {
                          if (window.prompt(`Delete ${user.email || "this account"} and its saved stock list? Type DELETE to confirm.`) === "DELETE") deleteMutation.mutate(user.id);
                        }}>Delete</Button>
                      </>}
                    </div></td>
                  </tr>
                )) : <tr><td className="p-4 text-slate-500" colSpan={5}>{accountsQuery.isLoading ? "Loading accounts…" : "No accounts found."}</td></tr>}</tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-slate-600">Showing {accountsQuery.data?.accounts.length ?? 0} of {accountsQuery.data?.total ?? 0}</span>
              <div className="flex gap-2"><Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</Button><Button variant="outline" size="sm" disabled={offset + 50 >= (accountsQuery.data?.total ?? 0)} onClick={() => setOffset(offset + 50)}>Next</Button></div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <FeedbackAdmin />
          <Card>
            <CardHeader><CardTitle>Recent owner actions</CardTitle></CardHeader>
            <CardContent className="max-h-[420px] space-y-3 overflow-y-auto">
              {auditQuery.data?.length ? auditQuery.data.map((item) => (
                <div className="border-b pb-2 text-sm" key={item.id}>
                  <p className="font-medium">{item.action.replaceAll("_", " ")}{item.targetAccountId ? ` · account #${item.targetAccountId}` : ""}</p>
                  <p className="text-xs text-slate-500">{item.actorEmail || "Owner"} · {new Date(item.createdAt).toLocaleString()}</p>
                </div>
              )) : <p className="text-sm text-slate-500">No owner actions recorded yet.</p>}
            </CardContent>
          </Card>
          <div className="lg:col-span-2"><CacheStats /></div>
        </div>
      </div>
    </main>
  );
};

function Metric({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  return <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-600">{title}</p><p className="mt-1 text-2xl font-semibold capitalize text-[#1A2942]">{value}</p></div><span className="text-blue-800">{icon}</span></CardContent></Card>;
}

export default Admin;
