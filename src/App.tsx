import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { NotAuthorized } from '@/components/NotAuthorized';
import { LoginPage } from '@/pages/LoginPage';
import { AdminDashboard } from '@/pages/AdminDashboard';
import { PartnerPage } from '@/pages/PartnerPage';
import type { UserRole } from '@/types/database';

function RootRedirect() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/login" replace />;

  const role: UserRole = profile.role;
  return <Navigate to={role === 'admin' ? '/admin' : '/partner'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/not-authorized" element={<NotAuthorized />} />
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/partner/*"
        element={
          <ProtectedRoute allowedRole="partner">
            <PartnerPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
