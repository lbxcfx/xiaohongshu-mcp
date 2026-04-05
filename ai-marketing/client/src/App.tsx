import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Positioning from "./pages/Positioning";
import TopicHub from "./pages/TopicHub";
import TopicGeneration from "./pages/TopicGeneration";
import ViralAnalysis from "./pages/ViralAnalysis";
import ScriptDirector from "./pages/ScriptDirector";
import MaterialGeneration from "./pages/MaterialGeneration";
import PlatformAdaptation from "./pages/PlatformAdaptation";
import XhsLoginPage from "./pages/XhsLoginPage";
import DashboardLayout from "./components/DashboardLayout";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/xhs-login" component={XhsLoginPage} />
      <Route path="/dashboard">
        <DashboardLayout>
          <Dashboard />
        </DashboardLayout>
      </Route>
      <Route path="/projects">
        <DashboardLayout>
          <Projects />
        </DashboardLayout>
      </Route>
      <Route path="/projects/:id">
        {(params) => (
          <DashboardLayout>
            <ProjectDetail id={params.id} />
          </DashboardLayout>
        )}
      </Route>
      <Route path="/projects/:id/positioning">
        {(params) => (
          <DashboardLayout>
            <Positioning projectId={params.id} />
          </DashboardLayout>
        )}
      </Route>
      <Route path="/projects/:id/topic-hub">
        {(params) => (
          <DashboardLayout>
            <TopicHub projectId={params.id} />
          </DashboardLayout>
        )}
      </Route>
      <Route path="/projects/:id/topics">
        {(params) => (
          <DashboardLayout>
            <TopicGeneration projectId={params.id} />
          </DashboardLayout>
        )}
      </Route>
      <Route path="/projects/:id/viral-analysis">
        {(params) => (
          <DashboardLayout>
            <ViralAnalysis projectId={params.id} />
          </DashboardLayout>
        )}
      </Route>
      <Route path="/projects/:id/scripts">
        {(params) => (
          <DashboardLayout>
            <ScriptDirector projectId={params.id} />
          </DashboardLayout>
        )}
      </Route>
      <Route path="/projects/:id/materials">
        {(params) => (
          <DashboardLayout>
            <MaterialGeneration projectId={params.id} />
          </DashboardLayout>
        )}
      </Route>
      <Route path="/projects/:id/platform">
        {(params) => (
          <DashboardLayout>
            <PlatformAdaptation projectId={params.id} />
          </DashboardLayout>
        )}
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <AppRouter />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
