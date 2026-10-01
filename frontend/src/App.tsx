import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { DashboardLayout } from "@/shared/components/layouts";

// Lazy-loaded pages (code splitting — loads each page only when needed)
const Landing         = lazy(() => import("./pages/landing/page"));
const Login           = lazy(() => import("./pages/login/page"));
const Callback        = lazy(() => import("./pages/callback/page"));
const Dashboard       = lazy(() => import("./pages/page"));
const Providers       = lazy(() => import("./pages/providers/page"));
const ProviderDetail  = lazy(() => import("./pages/providers/[id]/page"));
const ProvidersNew    = lazy(() => import("./pages/providers/new/page"));
const Usage           = lazy(() => import("./pages/usage/page"));
const Quota           = lazy(() => import("./pages/quota/page"));
const ProxyPools      = lazy(() => import("./pages/proxy-pools/page"));
const Combos          = lazy(() => import("./pages/combos/page"));
const Endpoint        = lazy(() => import("./pages/endpoint/page"));
const Translator      = lazy(() => import("./pages/translator/page"));
const Automation      = lazy(() => import("./pages/automation/page"));
const AntigravityTerminal = lazy(() => import("./pages/antigravity-terminal/page"));
const CompatibleChat = lazy(() => import("./pages/compatible-chat/page"));
const ModelDetection = lazy(() => import("./pages/model-detection/page"));
const Profile         = lazy(() => import("./pages/profile/page"));
const ConsoleLog      = lazy(() => import("./pages/console-log/page"));
const WeavyPool          = lazy(() => import("./pages/providers/weavy/pool/page"));
const AmmailTutorial     = lazy(() => import("./pages/automation/ammail-tutorial/page"));

// Auth guard — check if dashboard session cookie is present
function RequireAuth({ children }: { children: React.ReactNode }) {
  // Simple check — backend /api/auth/status will confirm
  const hasSession = document.cookie.includes("9r_session") ||
                     localStorage.getItem("9r_authed") === "1";
  if (!hasSession) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoadingFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <span>Loading...</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Public */}
          <Route path="/"       element={<Navigate to="/login" replace />} />
          <Route path="/login"  element={<Login />} />
          <Route path="/callback" element={<Callback />} />

          {/* Protected dashboard */}
          <Route path="/dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="providers"       element={<Providers />} />
            <Route path="providers/new"   element={<ProvidersNew />} />
            <Route path="providers/weavy/pool" element={<WeavyPool />} />
            <Route path="providers/:id"   element={<ProviderDetail />} />
            <Route path="usage"           element={<Usage />} />
            <Route path="quota"           element={<Quota />} />
            {/* Pricing settings page omitted in v2 currently */}
            <Route path="proxy-pools"     element={<ProxyPools />} />
            <Route path="combos"          element={<Combos />} />
            <Route path="endpoint"        element={<Endpoint />} />
            <Route path="translator"      element={<Translator />} />
            <Route path="automation"      element={<Automation />} />
            <Route path="automation/ammail-tutorial" element={<AmmailTutorial />} />
            <Route path="chat" element={<CompatibleChat />} />
            <Route path="model-detection" element={<ModelDetection />} />
            <Route path="antigravity" element={<AntigravityTerminal />} />
            <Route path="profile"         element={<Profile />} />
            <Route path="console-log"     element={<ConsoleLog />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
