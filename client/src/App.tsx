import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Feedback from "@/pages/Feedback";
import Admin from "@/pages/Admin";

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
            <Link href="/feedback" className="hover:underline">
              Feedback
            </Link>
          </div>
        </div>
      </nav>
    
      <div className="min-h-screen">
        <Switch>
          <Route path="/" component={Home} />
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
              <span className="mx-2">•</span>
              <Link href="/admin" className="text-gray-400 hover:text-gray-600 transition-colors">
                Admin
              </Link>
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
