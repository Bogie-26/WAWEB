import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import LoginPage from './pages/LoginPage';
import Layout from './pages/Layout';
import DashboardPage from './pages/DashboardPage';
import WhatsAppPage from './pages/WhatsAppPage';
import GroupsPage from './pages/GroupsPage';
import ApplicationsPage from './pages/ApplicationsPage';
import SettingsPage from './pages/SettingsPage';

function Guard() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/whatsapp" element={<WhatsAppPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<Guard />} />
      </Routes>
    </AuthProvider>
  );
}