import {
  LayoutDashboard, Users, UserCog, Building2, BedDouble, Wallet, CalendarCheck, CalendarDays,
  UtensilsCrossed, Wrench, BarChart3, Bell, User, DoorOpen,
} from 'lucide-react';

const dashboard = { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true };
const notifications = { to: '/notifications', label: 'Notifications', icon: Bell };

const staffCommon = [
  { to: '/students', label: 'Students', icon: Users },
  { to: '/hostels', label: 'Hostels & rooms', icon: Building2 },
  { to: '/allocations', label: 'Allocations', icon: BedDouble },
  { to: '/fees', label: 'Fees & payments', icon: Wallet },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/leaves', label: 'Leave requests', icon: CalendarDays },
  { to: '/mess', label: 'Mess', icon: UtensilsCrossed },
  { to: '/complaints', label: 'Complaints', icon: Wrench },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
];

export const NAV = {
  admin: [dashboard, staffCommon[0], { to: '/staff', label: 'Staff', icon: UserCog }, ...staffCommon.slice(1), notifications],
  warden: [dashboard, ...staffCommon, notifications],
  student: [
    dashboard,
    { to: '/my-room', label: 'My room', icon: DoorOpen },
    { to: '/fees', label: 'Fees', icon: Wallet },
    { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
    { to: '/leaves', label: 'Leave', icon: CalendarDays },
    { to: '/mess', label: 'Mess', icon: UtensilsCrossed },
    { to: '/complaints', label: 'Complaints', icon: Wrench },
    notifications,
    { to: '/profile', label: 'Profile', icon: User },
  ],
  maintenance: [
    dashboard,
    { to: '/complaints', label: 'Assigned tasks', icon: Wrench },
    notifications,
    { to: '/profile', label: 'Profile', icon: User },
  ],
};

export const ROLE_LABEL = { admin: 'Administrator', warden: 'Hostel warden', student: 'Student', maintenance: 'Maintenance staff' };
