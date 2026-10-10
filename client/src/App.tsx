import { Switch, Route, Link, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, UserButton, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Feedback from "@/pages/Feedback";
import Admin from "@/pages/Admin";
import ResearchPage from "@/pages/ResearchPage";
import Watchlist from "@/pages/Watchlist";
import Sp500Changes from "@/pages/Sp500Changes";
import type { AccountSummary } from "@/lib/types";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

const clerkAppearance = {
  theme: shadcn,
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#1A2942",
    colorForeground: "#1A2942",
    colorMutedForeground: "#64748B",
    colorDanger: "#B42318",
    colorBackground: "#FFFFFF",
    colorInput: "#FFFFFF",
    colorInputForeground: "#1A2942",
    colorNeutral: "#D6DEE8",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#1A2942] font-semibold",
    headerSubtitle: "text-slate-600",
    socialButtonsBlockButtonText: "text-[#1A2942]",
    formFieldLabel: "text-[#1A2942]",
    footerActionLink: "text-[#1A2942]",
    footerActionText: "text-slate-600",
    dividerText: "text-slate-500",
    identityPreviewEditButton: "text-[#1A2942]",
    formFieldSuccessText: "text-emerald-700",
    alertText: "text-rose-700",
    logoBox: "mb-4",
    logoImage: "max-h-12",
    socialButtonsBlockButton: "border-slate-200 hover:bg-slate-50",
    formButtonPrimary: "!bg-[#1A2942] !text-white !font-semibold hover:!bg-[#263d60]",
    formFieldInput: "border-slate-300 text-[#1A2942]",
    footerAction: "text-slate-600",
    dividerLine: "bg-slate-200",
    alert: "border-rose-200 bg-rose-50",
    otpCodeFieldInput: "border-slate-300",
    formFieldRow: "mb-4",
    main: "gap-4",
  },
};

function ClerkQueryCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const nextUserId = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== nextUserId) {
      queryClient.clear();
    }
    previousUserId.current = nextUserId;
  }), [addListener]);
  return null;
}

function AccountControls() {
  const { isSignedIn } = useUser();
  const account = useQuery<AccountSummary>({
    queryKey: ["/api/account"],
    enabled: Boolean(isSignedIn),
    staleTime: 30_000,
  });
  return (
    <>
      <Show when="signed-out">
        <Link href="/sign-in" className="hover:underline">Sign in</Link>
        <Link href="/sign-up" className="rounded-md bg-white px-2.5 py-1.5 font-semibold text-[#1A2942] hover:bg-slate-100">
          Create account
        </Link>
      </Show>
      <Show when="signed-in">
        {account.data?.role === "owner" && <Link href="/admin" className="hover:underline">Admin</Link>}
        <UserButton />
      </Show>
    </>
  );
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/watchlist" /></Show>
      <Show when="signed-out"><Home /></Show>
    </>
  );
}

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
      <nav className="bg-[#1A2942] text-white p-4" data-testid="mobile-nav">
        <div className="container mx-auto flex flex-row justify-between items-center gap-2">
          <Link href="/calculator" className="text-base sm:text-xl font-bold whitespace-nowrap shrink-0">
            <span className="sm:hidden">MoS Calc</span>
            <span className="hidden sm:inline">Margin of Safety Calculator</span>
          </Link>
          <div className="flex flex-nowrap items-center gap-x-2 sm:gap-x-4 text-xs sm:text-base whitespace-nowrap">
            <Link href="/calculator" className="hover:underline">
              Calculator
            </Link>
            <Link href="/watchlist" className="hover:underline" data-testid="nav-watchlist">
              Watchlist
            </Link>
            <Link href="/research" className="hover:underline hidden sm:inline">
              Research
            </Link>
            <Link href="/sp500-changes" className="hover:underline hidden sm:inline" data-testid="nav-sp500">
              S&amp;P
            </Link>
            <Link href="/feedback" className="hover:underline hidden sm:inline">
              Feedback
            </Link>
            <AccountControls />
          </div>
        </div>
      </nav>
    
      <div className="min-h-screen">
        <Switch>
          <Route path="/sign-in/*?" component={() => <div className="flex min-h-[75vh] items-center justify-center bg-slate-50 px-4 py-10"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>} />
          <Route path="/sign-up/*?" component={() => <div className="flex min-h-[75vh] items-center justify-center bg-slate-50 px-4 py-10"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>} />
          <Route path="/" component={HomeRoute} />
          <Route path="/calculator" component={Home} />
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

function ClerkWithWouter() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to your stock research account" } },
        signUp: { start: { title: "Create your free account", subtitle: "Save your personal stock watchlist" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkQueryCacheInvalidator />
      <Router />
      <Toaster />
    </ClerkProvider>
  );
}

function App() {
  if (!clerkPubKey) throw new Error("Clerk sign-in is not configured for this environment.");
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={basePath}>
        <ClerkWithWouter />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
