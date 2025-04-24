import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Download, Lock, Unlock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
  main_benefit?: string | null;
  mainBenefit?: string | null;
  improvements: string | null;
  email: string | null;
  created_at?: string; // ISO date string
  createdAt?: string; // ISO date string
}

const FeedbackAdmin: React.FC = () => {
  const [adminKey, setAdminKey] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Create headers with admin key when authenticated
  const createHeaders = () => {
    const headers: Record<string, string> = {};
    if (isAuthenticated) {
      headers['x-admin-key'] = adminKey;
    }
    return headers;
  };
  
  // Handle admin authentication
  const handleAuthenticate = async () => {
    if (!adminKey.trim()) {
      setAuthError('Please enter an admin key');
      return;
    }
    
    try {
      // Test authentication by making a request to the stats endpoint
      const response = await fetch('/api/feedback/stats', {
        headers: { 'x-admin-key': adminKey }
      });
      
      if (response.ok) {
        setIsAuthenticated(true);
        setAuthError(null);
        // Force refetch of queries now that we have authentication
        window.location.reload();
      } else {
        setAuthError('Invalid admin key');
      }
    } catch (error) {
      setAuthError('Authentication failed');
      console.error('Auth error:', error);
    }
  };
  
  // Fetch feedback statistics
  const { data: stats, isLoading: statsLoading } = useQuery<FeedbackStats>({
    queryKey: ['/api/feedback/stats'],
    queryFn: async () => {
      const response = await fetch('/api/feedback/stats', {
        headers: createHeaders()
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized: Admin access required');
        }
        throw new Error('Failed to fetch feedback stats');
      }
      return response.json();
    },
    enabled: isAuthenticated // Only run query if authenticated
  });

  // Fetch all feedback entries
  const { data: feedbackEntries, isLoading: entriesLoading } = useQuery<Feedback[]>({
    queryKey: ['/api/feedback'],
    queryFn: async () => {
      const response = await fetch('/api/feedback', {
        headers: createHeaders()
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized: Admin access required');
        }
        throw new Error('Failed to fetch feedback entries');
      }
      return response.json();
    },
    enabled: isAuthenticated // Only run query if authenticated
  });

  // Helper function to format the satisfaction level
  const formatSatisfaction = (satisfaction: string) => {
    switch (satisfaction) {
      case 'very_disappointed':
        return <Badge className="bg-green-500 hover:bg-green-600">Very Disappointed</Badge>;
      case 'somewhat_disappointed':
        return <Badge variant="outline" className="text-gray-600">Somewhat Disappointed</Badge>;
      case 'not_disappointed':
        return <Badge className="bg-red-500 hover:bg-red-600">Not Disappointed</Badge>;
      default:
        return satisfaction;
    }
  };

  // Helper function to format date
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
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

  // Function to export feedback data with admin key
  const exportFeedbackData = () => {
    if (!feedbackEntries || feedbackEntries.length === 0 || !isAuthenticated) return;
    
    // Create a URL with the admin key as a query parameter
    const exportUrl = `/api/feedback/export`;
    const win = window.open(`${exportUrl}?key=${encodeURIComponent(adminKey)}`, '_blank');
    
    if (!win) {
      console.error('Failed to open export window. Pop-up might be blocked.');
    }
  };

  // If not authenticated, show login form
  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Admin Authentication Required</CardTitle>
            <CardDescription>
              Please enter your admin key to view feedback data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {authError && (
                <Alert variant="destructive">
                  <AlertTitle>Authentication Failed</AlertTitle>
                  <AlertDescription>{authError}</AlertDescription>
                </Alert>
              )}
              
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="adminKey">Admin Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="adminKey"
                    type="password"
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                    className="flex-1"
                    placeholder="Enter your admin key"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAuthenticate();
                      }
                    }}
                  />
                  <Button
                    onClick={handleAuthenticate}
                    className="whitespace-nowrap"
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    Authenticate
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Authenticated view
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>Product-Market Fit Score</CardTitle>
            <CardDescription>
              Based on the Sean Ellis test: "How would you feel if you could no longer use this product?"
            </CardDescription>
          </div>
          <Badge variant="outline" className="flex items-center gap-1">
            <Unlock className="h-3 w-3" /> Admin Access
          </Badge>
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
                <div className="bg-green-50 p-3 rounded-md border border-green-100">
                  <p className="text-xs text-green-600">Very Disappointed</p>
                  <p className="text-xl font-bold text-green-600">
                    {stats.veryDisappointed}{' '}
                    <span className="text-sm font-normal">
                      ({((stats.veryDisappointed / stats.totalResponses) * 100).toFixed(1)}%)
                    </span>
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                  <p className="text-xs text-gray-600">Somewhat Disappointed</p>
                  <p className="text-xl font-bold text-gray-600">
                    {stats.somewhatDisappointed}{' '}
                    <span className="text-sm font-normal">
                      ({((stats.somewhatDisappointed / stats.totalResponses) * 100).toFixed(1)}%)
                    </span>
                  </p>
                </div>
                <div className="bg-red-50 p-3 rounded-md border border-red-100">
                  <p className="text-xs text-red-600">Not Disappointed</p>
                  <p className="text-xl font-bold text-red-600">
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
                        {formatDate(entry.created_at || entry.createdAt)}
                      </TableCell>
                      <TableCell>{formatSatisfaction(entry.satisfaction)}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {entry.main_benefit || entry.mainBenefit || '-'}
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
        {feedbackEntries && feedbackEntries.length > 0 && (
          <CardFooter>
            <Button 
              className="ml-auto"
              variant="default"
              onClick={exportFeedbackData}
              size="sm"
            >
              <Download className="mr-2 h-4 w-4" />
              View Feedback Data
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
};

export default FeedbackAdmin;