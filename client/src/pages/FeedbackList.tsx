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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  });

  const [isExporting, setIsExporting] = useState(false);

  // Function to export feedback data as PDF
  const exportToPDF = () => {
    if (!data || !data.feedback) return;
    
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      
      // Add title
      doc.setFontSize(18);
      doc.text('Margin of Safety Calculator - Feedback Report', 14, 22);
      
      // Add date
      doc.setFontSize(11);
      doc.text(`Generated: ${format(new Date(), 'PPP p')}`, 14, 30);
      doc.text(`Total Feedback: ${data.feedback.length}`, 14, 38);
      
      // Calculate PMF metrics
      const veryDisappointed = data.feedback.filter(item => item.pmfScore === '1').length;
      const totalResponses = data.feedback.filter(item => item.pmfScore).length;
      const pmfPercentage = totalResponses > 0 
        ? Math.round((veryDisappointed / totalResponses) * 100) 
        : 0;
      
      doc.text(`PMF Score: ${pmfPercentage}% (${veryDisappointed}/${totalResponses} "Very Disappointed")`, 14, 46);
      
      // Prepare table data
      const tableData = data.feedback.map(item => [
        item.name || '(Anonymous)',
        pmfLabels[item.pmfScore] || 'Not answered',
        item.improvement?.substring(0, 50) + (item.improvement?.length > 50 ? '...' : '') || '',
        format(new Date(item.submittedAt), 'MMM d, yyyy')
      ]);
      
      // Generate table
      autoTable(doc, {
        startY: 55,
        head: [['Name', 'PMF Response', 'Improvement Ideas', 'Date']],
        body: tableData,
        headStyles: { fillColor: [26, 41, 66] } // Dark blue header
      });
      
      // Save the PDF
      doc.save('feedback-report.pdf');
    } catch (error) {
      console.error('Error exporting to PDF:', error);
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
  const totalResponses = feedbackItems.filter(item => item.pmfScore).length;
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
            onClick={exportToPDF} 
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
                Export PDF
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