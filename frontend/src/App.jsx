import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Staff from './pages/Staff';
import Hostels from './pages/Hostels';
import Allocations from './pages/Allocations';
import MyRoom from './pages/MyRoom';
import Fees from './pages/Fees';
import Attendance from './pages/Attendance';
import Leaves from './pages/Leaves';
import Mess from './pages/Mess';
import Complaints from './pages/Complaints';
import Reports from './pages/Reports';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';

const STAFF = ['admin', 'warden'];

export default function App() {
  const { user } = useAuth();
  const guard = (roles, el) => <ProtectedRoute roles={roles}>{el}</ProtectedRoute>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={guard(STAFF, <Students />)} />
        <Route path="staff" element={guard(['admin'], <Staff />)} />
        <Route path="hostels" element={guard(STAFF, <Hostels />)} />
        <Route path="allocations" element={guard(STAFF, <Allocations />)} />
        <Route path="my-room" element={guard(['student'], <MyRoom />)} />
        <Route path="fees" element={guard([...STAFF, 'student'], <Fees />)} />
        <Route path="attendance" element={guard([...STAFF, 'student'], <Attendance />)} />
        <Route path="leaves" element={guard([...STAFF, 'student'], <Leaves />)} />
        <Route path="mess" element={guard([...STAFF, 'student'], <Mess />)} />
        <Route path="complaints" element={<Complaints />} />
        <Route path="reports" element={guard(STAFF, <Reports />)} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
