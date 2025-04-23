import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  DownloadIcon,
  RefreshCw,
  CalendarIcon,
  InfoIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  TrendingDownIcon,
  SearchIcon,
  ArrowUpRightIcon,
  FileTextIcon,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";

// Types for undervalued stocks report
interface UndervaluedStock {
  symbol: string;
  name: string;
  price: number;
  eps: number;
  fcf_per_share: number;
  growth_rate: number;
  intrinsic_value: number;
  buy_below_price: number;
  discount_premium: number;
  quality: string;
  quality_score: number;
  date_evaluated: string;
}

interface UndervaluedStocksReport {
  id: number;
  reportDate: string;
  stocksCount: number;
  indexes: string;
  stocks: UndervaluedStock[];
}

// Helper function to format price
const formatPrice = (price: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};

// Helper function to format percentage
const formatPercentage = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(value) / 100);
};

// Helper function to format date
const formatDate = (dateString: string) => {
  try {
    return format(new Date(dateString), "MMMM d, yyyy");
  } catch (error) {
    return dateString;
  }
};

const UndervaluedStocks = () => {
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const { toast } = useToast();

  // Fetch all reports
  const { 
    data: reports, 
    isLoading: isLoadingReports,
    isError: isErrorReports,
    error: reportsError,
    refetch: refetchReports
  } = useQuery<any[]>({ 
    queryKey: ['/api/undervalued/reports'],
    retry: 1
  });

  // Fetch the latest report by default or the selected report
  const { 
    data: report, 
    isLoading: isLoadingReport,
    isError: isErrorReport,
    error: reportError,
    refetch: refetchReport
  } = useQuery<UndervaluedStocksReport>({ 
    queryKey: ['/api/undervalued/latest'],
    enabled: !selectedReportId,
    retry: 1
  });

  // Fetch a specific report if selected
  const {
    data: selectedReport,
    isLoading: isLoadingSelectedReport,
    isError: isErrorSelectedReport,
    error: selectedReportError
  } = useQuery<UndervaluedStocksReport>({
    queryKey: ['/api/undervalued/reports', selectedReportId],
    enabled: !!selectedReportId,
    retry: 1
  });

  // Mutation for initiating a new scan
  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/undervalued/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error('Failed to initiate scan');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Stock scan initiated",
        description: "The market scan for undervalued stocks has been started. This may take a few minutes to complete.",
        variant: "default",
      });
      // Refetch reports after some delay
      setTimeout(() => {
        refetchReports();
        refetchReport();
      }, 5000);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  });

  // Handle report selection
  const handleReportChange = (value: string) => {
    if (value === "latest") {
      setSelectedReportId(null);
    } else {
      setSelectedReportId(Number(value));
    }
  };

  // Handle scan button click
  const handleScanClick = () => {
    scanMutation.mutate();
  };

  // Determine current report to display
  const currentReport: UndervaluedStocksReport | null = selectedReportId 
    ? (selectedReport as UndervaluedStocksReport) 
    : (report as UndervaluedStocksReport);

  // Loading state
  const isLoading = isLoadingReports || isLoadingReport || isLoadingSelectedReport || scanMutation.isPending;

  // Error state
  const isError = isErrorReports || isErrorReport || isErrorSelectedReport;
  const errorMessage = reportsError || reportError || selectedReportError;

  return (
    <div className="container mx-auto py-6 max-w-7xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#1A2942]">Undervalued Stocks</h1>
          <p className="text-[#5A6E85] mt-1">
            Monthly analysis of undervalued stocks in the S&P 500 and Russell 2000 indexes
          </p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleScanClick}
            disabled={isLoading || scanMutation.isPending}
          >
            {scanMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <SearchIcon className="h-4 w-4 mr-2" />
                Run New Scan
              </>
            )}
          </Button>
          {currentReport && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(`/api/undervalued/reports/${currentReport.id}/export`, '_blank')}
            >
              <DownloadIcon className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <CardTitle>Market Analysis Report</CardTitle>
              <CardDescription>
                Showing undervalued stocks based on intrinsic value calculation
              </CardDescription>
            </div>
            {reports && Array.isArray(reports) && reports.length > 0 && (
              <div className="mt-4 md:mt-0 w-full md:w-auto">
                <Select
                  onValueChange={handleReportChange}
                  defaultValue="latest"
                >
                  <SelectTrigger className="w-full md:w-[240px]">
                    <SelectValue placeholder="Select report date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">Latest Report</SelectItem>
                    {reports.map((r: any) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {formatDate(r.reportDate)} ({r.stocksCount} stocks)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-[#F9FAFB] p-4 rounded-md mb-4">
            <div className="flex items-start">
              <InfoIcon className="h-5 w-5 text-[#5A6E85] mt-0.5 mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm text-[#1A2942]">
                  This report is for research purposes only and does not constitute investment advice. The stocks listed here are identified as potentially undervalued based on quantitative metrics including DCF analysis, Graham Formula, and PE-based valuations.
                </p>
                <p className="text-sm text-[#5A6E85] mt-1">
                  The report runs on the first day of each month and analyzes stocks from the S&P 500 and Russell 2000 indexes.
                </p>
              </div>
            </div>
          </div>

          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-[300px] w-full" />
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-md">
              <AlertCircleIcon className="h-12 w-12 text-red-500 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">Error Loading Report</h3>
              <p className="text-sm text-gray-500 mb-4 text-center">
                {errorMessage instanceof Error ? errorMessage.message : "Failed to load undervalued stocks report"}
              </p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          )}

          {!isLoading && !isError && !currentReport && (
            <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-md">
              <FileTextIcon className="h-12 w-12 text-[#5A6E85] mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No Reports Available</h3>
              <p className="text-sm text-gray-500 mb-4 text-center">
                There are no undervalued stocks reports available yet. Run a new scan to generate a report.
              </p>
              <Button onClick={handleScanClick}>Run Market Scan</Button>
            </div>
          )}

          {!isLoading && !isError && currentReport && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-white border rounded-md p-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Report Date</p>
                  <p className="text-lg font-medium flex items-center">
                    <CalendarIcon className="h-4 w-4 mr-2 text-[#5A6E85]" />
                    {formatDate(currentReport.reportDate)}
                  </p>
                </div>
                <div className="bg-white border rounded-md p-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Analyzed Indexes</p>
                  <p className="text-lg font-medium">
                    {currentReport.indexes}
                  </p>
                </div>
                <div className="bg-white border rounded-md p-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Undervalued Stocks Found</p>
                  <p className="text-lg font-medium flex items-center">
                    <TrendingDownIcon className="h-4 w-4 mr-2 text-green-500" />
                    {currentReport.stocksCount} stocks
                  </p>
                </div>
              </div>

              <Separator className="my-4" />

              {currentReport.stocks && currentReport.stocks.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableCaption>
                      Showing {currentReport.stocks.length} undervalued stocks as of {formatDate(currentReport.reportDate)}
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Intrinsic Value</TableHead>
                        <TableHead>Buy Below</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Quality</TableHead>
                        <TableHead>EPS</TableHead>
                        <TableHead>Growth</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentReport.stocks.map((stock) => (
                        <TableRow key={stock.symbol}>
                          <TableCell className="font-medium">
                            <Link to={`/?symbol=${stock.symbol}`} className="text-blue-600 hover:underline flex items-center">
                              {stock.symbol}
                              <ArrowUpRightIcon className="h-3 w-3 ml-1" />
                            </Link>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={stock.name}>
                            {stock.name}
                          </TableCell>
                          <TableCell>{formatPrice(stock.price)}</TableCell>
                          <TableCell>{formatPrice(stock.intrinsic_value)}</TableCell>
                          <TableCell>{formatPrice(stock.buy_below_price)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              {formatPercentage(stock.discount_premium * -1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={stock.quality === 'Exceptional' ? 'default' :
                                      stock.quality === 'Good' ? 'secondary' :
                                      stock.quality === 'Average' ? 'outline' : 'destructive'}
                              className={
                                stock.quality === 'Exceptional' ? 'bg-green-100 text-green-800 hover:bg-green-100' :
                                stock.quality === 'Good' ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' :
                                stock.quality === 'Average' ? 'bg-orange-100 text-orange-800 hover:bg-orange-100' :
                                'bg-red-100 text-red-800 hover:bg-red-100'
                              }
                            >
                              {stock.quality}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatPrice(stock.eps)}</TableCell>
                          <TableCell>{stock.growth_rate.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center p-8 bg-gray-50 rounded-md">
                  <p className="text-gray-500">No undervalued stocks found in this report</p>
                </div>
              )}
            </>
          )}
        </CardContent>
        <CardFooter className="text-sm text-[#5A6E85] border-t pt-4">
          <p>
            Disclaimer: Stocks are listed strictly for informational purposes. Always conduct your own research and due diligence.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default UndervaluedStocks;