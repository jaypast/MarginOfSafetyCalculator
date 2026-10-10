import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Trash2 } from "lucide-react";

interface FeedbackStats {
  totalResponses: number;
  veryDisappointed: number;
  somewhatDisappointed: number;
  notDisappointed: number;
  pmfScore: number;
}
interface Feedback {
  id: number;
  satisfaction: string;
  mainBenefit: string | null;
  improvements: string | null;
  email: string | null;
  createdAt: string;
}

export const FeedbackAdmin: React.FC = () => {
  const [exportError, setExportError] = useState("");
  const stats = useQuery<FeedbackStats>({ queryKey: ["/api/feedback/stats"] });
  const entries = useQuery<Feedback[]>({ queryKey: ["/api/feedback"] });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/feedback/${id}`, undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/feedback/stats"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/audit"] });
    },
  });

  const exportFeedback = async () => {
    try {
      setExportError("");
      const response = await fetch("/api/feedback/export", { credentials: "include" });
      if (!response.ok) throw new Error("Feedback export could not be downloaded.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "feedback.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Feedback export could not be downloaded.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div><CardTitle>User feedback</CardTitle><p className="mt-1 text-sm text-slate-600">Owner-only feedback review and export.</p></div>
        <Button variant="outline" size="sm" onClick={() => void exportFeedback()}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {exportError && <p className="text-sm text-red-700" role="alert">{exportError}</p>}
        {stats.data && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <FeedbackMetric title="Responses" value={stats.data.totalResponses} />
          <FeedbackMetric title="Very disappointed" value={stats.data.veryDisappointed} />
          <FeedbackMetric title="Somewhat" value={stats.data.somewhatDisappointed} />
          <FeedbackMetric title="PMF score" value={`${stats.data.pmfScore.toFixed(1)}%`} />
        </div>}
        {stats.error && <p className="text-sm text-red-700">{stats.error.message}</p>}
        <div className="max-h-[480px] space-y-3 overflow-y-auto">
          {entries.isLoading ? <p className="text-sm text-slate-500">Loading feedback…</p>
            : entries.error ? <p className="text-sm text-red-700">{entries.error.message}</p>
              : entries.data?.length ? [...entries.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => (
                <article className="rounded-md border bg-white p-3" key={entry.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><Badge variant="outline">{entry.satisfaction.replaceAll("_", " ")}</Badge><p className="mt-1 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()} {entry.email ? `· ${entry.email}` : ""}</p></div>
                    <Button variant="ghost" size="sm" aria-label="Delete feedback" disabled={remove.isPending} onClick={() => {
                      if (window.confirm("Delete this feedback entry? This cannot be undone.")) remove.mutate(entry.id);
                    }}><Trash2 className="h-4 w-4 text-red-700" /></Button>
                  </div>
                  {entry.mainBenefit && <p className="mt-2 text-sm"><strong>Main benefit:</strong> {entry.mainBenefit}</p>}
                  {entry.improvements && <p className="mt-1 text-sm"><strong>Improvements:</strong> {entry.improvements}</p>}
                </article>
              )) : <p className="text-sm text-slate-500">No feedback submissions yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
};

function FeedbackMetric({ title, value }: { title: string; value: string | number }) {
  return <div className="rounded-md border bg-white p-3"><p className="text-xs text-slate-500">{title}</p><p className="mt-1 text-lg font-semibold text-[#1A2942]">{value}</p></div>;
}

export default FeedbackAdmin;
