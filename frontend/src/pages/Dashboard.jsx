import { useAuth } from '../context/AuthContext';
import AdminDashboard from './dashboards/AdminDashboard';
import WardenDashboard from './dashboards/WardenDashboard';
import StudentDashboard from './dashboards/StudentDashboard';
import MaintenanceDashboard from './dashboards/MaintenanceDashboard';

const BY_ROLE = { admin: AdminDashboard, warden: WardenDashboard, student: StudentDashboard, maintenance: MaintenanceDashboard };

export default function Dashboard() {
  const { user } = useAuth();
  const Page = BY_ROLE[user.role];
  return <Page />;
}
