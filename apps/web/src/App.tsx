import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from './app/AuthContext';
import { Login } from './app/Login';
import { Shell } from './app/Shell';
import { ErrorBoundary } from './app/ErrorBoundary';

const Dashboard = lazy(() => import('./app/pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Opportunities = lazy(() => import('./app/pages/Opportunities').then((module) => ({ default: module.Opportunities })));
const PortalControls = lazy(() => import('./app/pages/PortalControls').then((module) => ({ default: module.PortalControls })));
const CollectionJobs = lazy(() => import('./app/pages/CollectionJobs').then((module) => ({ default: module.CollectionJobs })));
const Settings = lazy(() => import('./app/pages/Settings').then((module) => ({ default: module.Settings })));
const BidDecisions = lazy(() => import('./app/pages/BidOperations').then((module) => ({ default: module.BidDecisions })));
const TalentSourcing = lazy(() => import('./app/pages/BidOperations').then((module) => ({ default: module.TalentSourcing })));
const ResponseReview = lazy(() => import('./app/pages/BidOperations').then((module) => ({ default: module.ResponseReview })));

const PageLoading = () => <div className="loading-state" role="status"><span className="spinner" />Loading page…</div>;

function Workspace() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading"><div className="brand-mark"><span>CA</span></div><span className="spinner" />Loading your workspace…</div>;
  if (!user) return <Login />;
  const isManagement = user.role === 'super_admin';
  return <ErrorBoundary><Suspense fallback={<PageLoading />}>
    <Routes>
      <Route element={<Shell />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/talent-sourcing" element={<TalentSourcing />} />
        {isManagement && <Route path="/opportunities" element={<Opportunities />} />}
        {isManagement && <Route path="/bid-decisions" element={<BidDecisions />} />}
        {isManagement && <Route path="/response-review" element={<ResponseReview />} />}
        {isManagement && <Route path="/portal-controls" element={<PortalControls />} />}
        {isManagement && <Route path="/collection-jobs" element={<CollectionJobs />} />}
        {isManagement && <Route path="/settings" element={<Settings />} />}
        <Route path="*" element={<Navigate to={user.role === 'sourcing_user' ? '/talent-sourcing' : '/opportunities'} replace />} />
      </Route>
    </Routes>
  </Suspense></ErrorBoundary>;
}

export default Workspace;
