import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient.ts";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster.tsx";
import LandingPage from "@/pages/landing.tsx";
import AuthPage from "@/pages/auth.tsx";
import ChatPage from "@/pages/chat.tsx";
import NotFound from "@/pages/not-found.tsx";
import VerifyEmail from "@/pages/verify-email.tsx"; // Added import

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Make queryClient accessible globally for WebSocket updates
  (window as any).queryClient = queryClient;

  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;