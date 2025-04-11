import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface FeedbackItem {
  id: number;
  name: string;
  email: string;
  pmfScore: string;
  improvement: string;
  feedback: string;
  submittedAt: string;
}

interface FeedbackResponse {
  success: boolean;
  count: number;
  feedback: FeedbackItem[];
}

// Labels for PMF scores
const pmfLabels: Record<string, string> = {
  '1': 'Very disappointed',
  '2': 'Somewhat disappointed',
  '3': 'Not disappointed',
  '4': 'N/A - Don\'t use it'
};

// Helper to get color based on PMF score
const getPmfColor = (score: string): string => {
  switch(score) {
    case '1': return 'bg-green-100 text-green-800 hover:bg-green-200';
    case '2': return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
    case '3': return 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200';
    case '4': return 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300';
    default: return 'bg-neutral-100 text-neutral-800';
  }
};

export default function FeedbackList() {
  const { data, isLoading, isError, error, refetch } = useQuery<FeedbackResponse>({
    queryKey: ['/api/feedback'],
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
    gcTime: 1000 * 60 * 5, // 5 minutes
  });

  const [isExporting, setIsExporting] = useState(false);

  // Function to export feedback data in a simpler way
  const exportToCSV = () => {
    if (!data || !data.feedback || data.feedback.length === 0) return;
    
    setIsExporting(true);
    try {
      // Create a simple text representation of the data
      let textContent = "Feedback Export - " + new Date().toLocaleString() + "\n\n";
      
      // Add summary
      textContent += `Total Responses: ${data.feedback.length}\n`;
      textContent += `PMF Score: ${pmfPercentage}%\n\n`;
      
      // Add each feedback entry
      data.feedback.forEach((item, index) => {
        textContent += `--- RESPONSE #${index + 1} ---\n`;
        textContent += `Name: ${item.name || "(Anonymous)"}\n`;
        textContent += `Email: ${item.email || "-"}\n`;
        textContent += `PMF Response: ${pmfLabels[item.pmfScore] || item.pmfScore || "Not answered"}\n`;
        textContent += `Improvement Ideas: ${item.improvement || "-"}\n`;
        textContent += `Additional Feedback: ${item.feedback || "-"}\n`;
        textContent += `Date: ${format(new Date(item.submittedAt), 'MMM d, yyyy')}\n\n`;
      });
      
      // Open in a new tab for easy copying
      const newTab = window.open();
      if (newTab) {
        newTab.document.write(`
          <html>
            <head>
              <title>Feedback Export</title>
              <style>
                body { font-family: monospace; white-space: pre-wrap; padding: 20px; }
                button { padding: 8px 16px; margin-bottom: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <button onclick="navigator.clipboard.writeText(document.getElementById('content').innerText)">
                Copy All Text
              </button>
              <div id="content">${textContent}</div>
            </body>
          </html>
        `);
        newTab.document.close();
      } else {
        console.error("Unable to open new tab. Please check your browser settings.");
        alert("Unable to open export in new tab. Please check your browser settings.");
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Error exporting data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }
  
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-red-500 text-xl">Error loading feedback data</p>
        <p>{(error as Error)?.message || 'Unknown error'}</p>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }
  
  const feedbackItems = data?.feedback || [];
  
  // Calculate PMF score
  const veryDisappointed = feedbackItems.filter(item => item.pmfScore === '1').length;
  const totalResponses = feedbackItems.filter(item => item.pmfScore && item.pmfScore !== '').length;
  const pmfPercentage = totalResponses > 0 
    ? Math.round((veryDisappointed / totalResponses) * 100) 
    : 0;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[#1A2942]">Feedback Responses</h1>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            className="flex items-center gap-1"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={exportToCSV} 
            disabled={isExporting || feedbackItems.length === 0}
            className="flex items-center gap-1 bg-[#1A2942] hover:bg-[#283c5f]"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export Data
              </>
            )}
          </Button>
        </div>
      </div>
      
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Responses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{feedbackItems.length}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">PMF Score</CardTitle>
            <CardDescription>% of "Very Disappointed" users</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{pmfPercentage}%</p>
            <p className="text-sm text-muted-foreground">
              {veryDisappointed} out of {totalResponses} responses
            </p>
            <div className="mt-3 text-xs text-muted-foreground border-t pt-2 border-neutral-100">
              <p className="font-medium mb-1">What is PMF Score?</p>
              <p>
                The Product-Market Fit (PMF) score measures how essential your product is to users.
                It's calculated as the percentage of users who would be "very disappointed" if they could no longer use your product.
              </p>
              <p className="mt-1">
                <span className="font-medium">40%+</span>: Strong PMF. <span className="font-medium">25-40%</span>: Good PMF. <span className="font-medium">&lt;25%</span>: Needs improvement.
              </p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Response Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            {feedbackItems.length > 0 ? (
              <div className="text-sm">
                <p>First: {format(new Date(feedbackItems[feedbackItems.length - 1].submittedAt), 'MMM d, yyyy')}</p>
                <p>Latest: {format(new Date(feedbackItems[0].submittedAt), 'MMM d, yyyy')}</p>
              </div>
            ) : (
              <p>No responses yet</p>
            )}
          </CardContent>
        </Card>
      </div>
      
      {feedbackItems.length === 0 ? (
        <div className="text-center py-12 bg-neutral-50 rounded-lg border border-neutral-200">
          <p className="text-lg text-neutral-500">No feedback responses yet</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-hidden">
            <Table>
              <TableCaption>All feedback responses from users</TableCaption>
              <TableHeader>
                <TableRow className="bg-neutral-50">
                  <TableHead className="w-[120px]">Name</TableHead>
                  <TableHead className="w-[120px]">Email</TableHead>
                  <TableHead className="w-[120px]">PMF Response</TableHead>
                  <TableHead>Improvement Ideas</TableHead>
                  <TableHead>Additional Feedback</TableHead>
                  <TableHead className="w-[120px] text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feedbackItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.name || <span className="text-neutral-400 italic">(Anonymous)</span>}
                    </TableCell>
                    <TableCell>
                      {item.email || <span className="text-neutral-400 italic">-</span>}
                    </TableCell>
                    <TableCell>
                      {item.pmfScore ? (
                        <Badge className={getPmfColor(item.pmfScore)}>
                          {pmfLabels[item.pmfScore] || item.pmfScore}
                        </Badge>
                      ) : (
                        <span className="text-neutral-400 italic">Not answered</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[250px] break-words">
                      {item.improvement || <span className="text-neutral-400 italic">-</span>}
                    </TableCell>
                    <TableCell className="max-w-[250px] break-words">
                      {item.feedback || <span className="text-neutral-400 italic">-</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {format(new Date(item.submittedAt), 'MMM d, yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}