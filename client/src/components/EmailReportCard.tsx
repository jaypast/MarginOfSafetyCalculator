// "Email me the full report" card on the Research page (Task #57).
//
// Submits an email address to kick off the ~5-hour background scan of the
// full Russell 3000, then polls the (global, email-masked) status endpoint
// while a job is live. Handles all terminal states: sent, email_failed
// (CSV still downloadable), and failed.

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { createReportRequestSchema, type ReportStatusResponse } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, Download, Loader2, Mail } from 'lucide-react';

const STATUS_QUERY_KEY = ['/api/research/report/status'];
const POLL_MS = 5000;

const formSchema = createReportRequestSchema;
type FormValues = z.infer<typeof formSchema>;

export default function EmailReportCard() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ReportStatusResponse>({
    queryKey: STATUS_QUERY_KEY,
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === 'queued' || status === 'running' ? POLL_MS : false;
    },
  });

  const job = data?.job ?? null;
  const jobActive = job?.status === 'queued' || job?.status === 'running';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  });

  const requestReport = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await apiRequest('POST', '/api/research/report', values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
      form.reset();
      toast({
        title: 'Report scan started',
        description: 'Scanning all ~3,000 companies takes several hours. We\u2019ll email you when it\u2019s done \u2014 you can close this page.',
      });
    },
    onError: (error: Error) => {
      const alreadyRunning = error.message.startsWith('409');
      queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
      toast({
        title: alreadyRunning ? 'A report is already in progress' : 'Could not start the report',
        description: alreadyRunning
          ? 'Only one full-universe scan can run at a time. Check back once the current one finishes.'
          : error.message,
        variant: alreadyRunning ? 'default' : 'destructive',
      });
    },
  });

  const progressPct = job && job.total > 0 ? Math.round((job.scanned / job.total) * 100) : 0;

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-[#1A2942]" />
          Email Me the Full Report
        </CardTitle>
        <CardDescription>
          The table above shows the top 10. This scans <strong>every</strong> Russell 3000 company and emails
          you a summary plus a CSV covering all ~3,000 — including which data source answered for each one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking report status…
          </div>
        ) : jobActive && job ? (
          <div className="space-y-3" data-testid="report-progress">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              {job.status === 'queued'
                ? 'Report queued — starting shortly…'
                : `Scanning ${job.scanned.toLocaleString()} of ${job.total.toLocaleString()} companies (${progressPct}%)`}
            </div>
            <Progress value={progressPct} />
            <p className="text-xs text-neutral-500">
              Will be emailed to <span className="font-medium">{job.maskedEmail}</span> when finished.
              The scan deliberately paces itself (~6s per company, roughly 5 hours total) to respect
              free-tier data source limits. It survives restarts — no need to keep this page open.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {job?.status === 'sent' && (
              <div className="flex items-start gap-2 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800" data-testid="report-sent-banner">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  Last report was emailed to <span className="font-medium">{job.maskedEmail}</span>
                  {job.completedAt ? ` on ${new Date(job.completedAt).toLocaleString()}` : ''}.{' '}
                  <a className="underline font-medium inline-flex items-center gap-1" href={`/api/research/report/${job.id}/download`}>
                    <Download className="h-3 w-3" /> Download the CSV again
                  </a>
                </div>
              </div>
            )}
            {job?.status === 'email_failed' && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800" data-testid="report-email-failed-banner">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  The last scan finished, but the email to <span className="font-medium">{job.maskedEmail}</span> could
                  not be delivered.{' '}
                  <a className="underline font-medium inline-flex items-center gap-1" href={`/api/research/report/${job.id}/download`}>
                    <Download className="h-3 w-3" /> Download the CSV directly
                  </a>
                </div>
              </div>
            )}
            {job?.status === 'failed' && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800" data-testid="report-failed-banner">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>The last report run hit an unrecoverable error. You can request a new one below.</div>
              </div>
            )}

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((values) => requestReport.mutate(values))}
                className="flex flex-col sm:flex-row gap-3 sm:items-end"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="flex-1 max-w-md">
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" data-testid="input-report-email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={requestReport.isPending} data-testid="button-request-report">
                  {requestReport.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starting…</>
                  ) : (
                    <><Mail className="h-4 w-4 mr-2" /> Email me the report</>
                  )}
                </Button>
              </form>
            </Form>
            <p className="text-xs text-neutral-500">
              Takes roughly 5 hours — the scan deliberately goes slow to respect free data source limits.
              Only one report can be generated at a time across all users.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
