import {
  CalendarDays,
  CalendarMinus,
  ChartColumn,
  Clock,
  Fingerprint,
  Timer,
  History,
  Settings,
  SlidersHorizontal,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    label: "Daily",
    items: [
      { href: "/today", label: "Today", icon: Clock },
      { href: "/attendance", label: "Attendance", icon: CalendarDays },
      { href: "/leave", label: "Leave", icon: CalendarMinus },
    ],
  },
  {
    label: "Monthly",
    items: [
      { href: "/payroll", label: "Payroll", icon: Wallet },
      { href: "/reports", label: "Reports", icon: ChartColumn },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/employees", label: "Employees", icon: Users },
      { href: "/shifts", label: "Shifts", icon: Timer },
      { href: "/devices", label: "Devices", icon: Fingerprint },
      { href: "/rules", label: "Pay rules", icon: SlidersHorizontal },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Records",
    items: [{ href: "/audit", label: "Audit log", icon: History }],
  },
];

/** The four screens on the phone tab bar. Everything else is under More. */
export const primaryTabHrefs = ["/today", "/attendance", "/leave", "/payroll"] as const;

export const allNavItems: NavItem[] = navGroups.flatMap((group) => group.items);
