import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Feedback from "@/pages/Feedback";
import Admin from "@/pages/Admin";
import ResearchPage from "@/pages/ResearchPage";
import Watchlist from "@/pages/Watchlist";
import Sp500Changes from "@/pages/Sp500Changes";

function Router() {
  const { toast } = useToast();
  useEffect(() => {
    fetch("/api/sp500/changes?check=true")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const count = data?.update?.newCount ?? 0;
        if (count > 0) {
          toast({
            title: "Just added",
            description: `${count} new S&P 500 ${count === 1 ? "change" : "changes"} were evaluated.`,
            action: <ToastAction altText="View S&P 500 changes" onClick={() => { window.location.href = "/sp500-changes"; }}>View</ToastAction>,
          });
        }
      })
      .catch(() => undefined);
  }, [toast]);
  return (
    <>
      <nav className="bg-[#1A2942] text-white p-4">
        <div className="container mx-auto flex flex-row justify-between items-center gap-2">
          <Link href="/" className="text-base sm:text-xl font-bold whitespace-nowrap shrink-0">
            <span className="sm:hidden">MoS Calc</span>
            <span className="hidden sm:inline">Margin of Safety Calculator</span>
          </Link>
          <div className="flex flex-nowrap items-center gap-x-2 sm:gap-x-4 text-xs sm:text-base whitespace-nowrap">
            <Link href="/" className="hover:underline">
              Home
            </Link>
            <Link href="/watchlist" className="hover:underline" data-testid="nav-watchlist">
              Watchlist
            </Link>
            <Link href="/research" className="hover:underline">
              Research
            </Link>
            <Link href="/sp500-changes" className="hover:underline" data-testid="nav-sp500">
              S&amp;P
            </Link>
            <Link href="/feedback" className="hover:underline hidden sm:inline">
              Feedback
            </Link>
          </div>
        </div>
      </nav>
    
      <div className="min-h-screen">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/watchlist" component={Watchlist} />
          <Route path="/research" component={ResearchPage} />
          <Route path="/sp500-changes" component={Sp500Changes} />
          <Route path="/feedback" component={Feedback} />
          <Route path="/admin" component={Admin} />
          <Route component={NotFound} />
        </Switch>
      </div>
      
      <footer className="bg-gray-100 text-gray-600 py-6 mt-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <p className="text-sm">© {new Date().getFullYear()} Margin of Safety Calculator. All rights reserved.</p>
            </div>
            <div className="text-xs text-gray-400 flex items-center">
              <span>Powered by Value Investing Principles</span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
