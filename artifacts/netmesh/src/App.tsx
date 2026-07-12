import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import MainLayout from '@/layouts/MainLayout';
import Dashboard from '@/pages/Dashboard';
import ShareLink from '@/pages/ShareLink';
import MyLinks from '@/pages/MyLinks';
import Profile from '@/pages/Profile';
import Settings from '@/pages/Settings';

const queryClient = new QueryClient();

function Router() {
  return (
    <MainLayout>
      <Switch>
        {/* ── Core pages ─────────────────────────────────── */}
        <Route path="/" component={Dashboard} />
        <Route path="/share" component={ShareLink} />
        <Route path="/links" component={MyLinks} />

        {/* ── User profile: public shareable URL ─────────── */}
        {/* Matches both /profile  and  /profile/:username   */}
        <Route path="/profile/:username?" component={Profile} />

        {/* ── Settings ───────────────────────────────────── */}
        <Route path="/settings" component={Settings} />

        {/* ── 404 ────────────────────────────────────────── */}
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
