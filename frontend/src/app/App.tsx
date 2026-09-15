import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/store';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/containers/DashboardPage';
import { ContainerViewPage } from '@/features/containers/ContainerViewPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { Layout } from './Layout';
import { Spinner } from '@/shared/ui/Spinner';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const bootstrap = useAuth((s) => s.bootstrap);
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    if (status === 'idle') void bootstrap();
  }, [status, bootstrap]);

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="min-h-full grid place-items-center bg-bg">
        <Spinner size={20} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/containers/:id"
          element={
            <RequireAuth>
              <ContainerViewPage />
            </RequireAuth>
          }
        />
        <Route
          path="/projects"
          element={
            <RequireAuth>
              <ProjectsPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
