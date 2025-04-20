import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/queryClient';

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
  main_benefit: string | null;
  improvements: string | null;
  email: string | null;
  created_at: string; // ISO date string
}

const FeedbackAdmin: React.FC = () => {
  // Fetch feedback statistics
  const { data: stats, isLoading: statsLoading } = useQuery<FeedbackStats>({
    queryKey: ['/api/feedback/stats'],
    queryFn: async () => {
      const response = await fetch('/api/feedback/stats');
      if (!response.ok) {
        throw new Error('Failed to fetch feedback stats');
      }
      return response.json();
    }
  });

  // Fetch all feedback entries
  const { data: feedbackEntries, isLoading: entriesLoading } = useQuery<Feedback[]>({
    queryKey: ['/api/feedback'],
    queryFn: async () => {
      const response = await fetch('/api/feedback');
      if (!response.ok) {
        throw new Error('Failed to fetch feedback entries');
      }
      return response.json();
    }
  });

  // Helper function to format the satisfaction level
  const formatSatisfaction = (satisfaction: string) => {
    switch (satisfaction) {
      case 'very_disappointed':
        return <Badge variant="destructive">Very Disappointed</Badge>;
      case 'somewhat_disappointed':
        return <Badge variant="outline">Somewhat Disappointed</Badge>;
      case 'not_disappointed':
        return <Badge variant="secondary">Not Disappointed</Badge>;
      default:
        return satisfaction;
    }
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get the PMF Score color based on value
  const getPmfScoreColor = (score: number) => {
    if (score >= 40) return 'text-green-600 font-bold'; // Over 40% is great (Product-Market Fit)
    if (score >= 25) return 'text-amber-600 font-bold'; // 25-40% is okay
    return 'text-red-600 font-bold'; // Under 25% needs improvement
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Product-Market Fit Score</CardTitle>
          <CardDescription>
            Based on the Sean Ellis test: "How would you feel if you could no longer use this product?"
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="h-40 flex items-center justify-center">
              <p>Loading stats...</p>
            </div>
          ) : stats && stats.totalResponses > 0 ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-sm font-medium">PMF Score:</span>
                  <span className={getPmfScoreColor(stats.pmfScore)}>
                    {stats.pmfScore.toFixed(1)}%
                  </span>
                </div>
                <Progress value={stats.pmfScore} max={100} />
                <p className="text-xs text-gray-500">
                  {stats.pmfScore >= 40
                    ? 'Great! You have achieved Product-Market Fit.'
                    : stats.pmfScore >= 25
                    ? 'Getting there. Keep improving.'
                    : 'Needs work to reach Product-Market Fit.'}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                  <p className="text-xs text-gray-500">Total Responses</p>
                  <p className="text-xl font-bold">{stats.totalResponses}</p>
                </div>
                <div className="bg-red-50 p-3 rounded-md border border-red-100">
                  <p className="text-xs text-red-500">Very Disappointed</p>
                  <p className="text-xl font-bold text-red-600">
                    {stats.veryDisappointed}{' '}
                    <span className="text-sm font-normal">
                      ({((stats.veryDisappointed / stats.totalResponses) * 100).toFixed(1)}%)
                    </span>
                  </p>
                </div>
                <div className="bg-amber-50 p-3 rounded-md border border-amber-100">
                  <p className="text-xs text-amber-500">Somewhat Disappointed</p>
                  <p className="text-xl font-bold text-amber-600">
                    {stats.somewhatDisappointed}{' '}
                    <span className="text-sm font-normal">
                      ({((stats.somewhatDisappointed / stats.totalResponses) * 100).toFixed(1)}%)
                    </span>
                  </p>
                </div>
                <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
                  <p className="text-xs text-blue-500">Not Disappointed</p>
                  <p className="text-xl font-bold text-blue-600">
                    {stats.notDisappointed}{' '}
                    <span className="text-sm font-normal">
                      ({((stats.notDisappointed / stats.totalResponses) * 100).toFixed(1)}%)
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center bg-gray-50 rounded-md">
              <p className="text-gray-500">No feedback data available yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feedback Responses</CardTitle>
          <CardDescription>
            All user feedback submissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entriesLoading ? (
            <div className="h-40 flex items-center justify-center">
              <p>Loading feedback...</p>
            </div>
          ) : feedbackEntries && feedbackEntries.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Satisfaction</TableHead>
                    <TableHead>Main Benefit</TableHead>
                    <TableHead>Improvements</TableHead>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feedbackEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(entry.created_at)}
                      </TableCell>
                      <TableCell>{formatSatisfaction(entry.satisfaction)}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {entry.main_benefit || '-'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {entry.improvements || '-'}
                      </TableCell>
                      <TableCell>{entry.email || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center bg-gray-50 rounded-md">
              <p className="text-gray-500">No feedback submissions yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FeedbackAdmin;