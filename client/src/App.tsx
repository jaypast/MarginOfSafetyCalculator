import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Feedback from "@/pages/Feedback";
import UndervaluedStocks from "@/pages/UndervaluedStocks";

function Router() {
  return (
    <>
      <nav className="bg-[#1A2942] text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/" className="text-xl font-bold">
            Margin of Safety Calculator
          </Link>
          <div className="space-x-4">
            <Link href="/" className="hover:underline">
              Home
            </Link>
            <Link href="/undervalued" className="hover:underline">
              Undervalued Stocks
            </Link>
            <Link href="/feedback" className="hover:underline">
              Feedback
            </Link>
          </div>
        </div>
      </nav>
    
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/undervalued" component={UndervaluedStocks} />
        <Route path="/feedback" component={Feedback} />
        <Route component={NotFound} />
      </Switch>
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
