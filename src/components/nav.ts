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

import type { Accent } from "@/components/accent";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** The color of this screen in the menu and its heading. */
  accent: Accent;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    label: "Daily",
    items: [
      { href: "/today", label: "Today", icon: Clock, accent: "green" },
      { href: "/attendance", label: "Attendance", icon: CalendarDays, accent: "indigo" },
      { href: "/leave", label: "Leave", icon: CalendarMinus, accent: "violet" },
    ],
  },
  {
    label: "Monthly",
    items: [
      { href: "/payroll", label: "Payroll", icon: Wallet, accent: "orange" },
      { href: "/reports", label: "Reports", icon: ChartColumn, accent: "teal" },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/employees", label: "Employees", icon: Users, accent: "pink" },
      { href: "/shifts", label: "Shifts", icon: Timer, accent: "sky" },
      { href: "/devices", label: "Devices", icon: Fingerprint, accent: "lime" },
      { href: "/rules", label: "Pay rules", icon: SlidersHorizontal, accent: "orange" },
      { href: "/settings", label: "Settings", icon: Settings, accent: "slate" },
    ],
  },
  {
    label: "Records",
    items: [{ href: "/audit", label: "Audit log", icon: History, accent: "slate" }],
  },
];

/** The four screens on the phone tab bar. Everything else is under More. */
export const primaryTabHrefs = ["/today", "/attendance", "/leave", "/payroll"] as const;

export const allNavItems: NavItem[] = navGroups.flatMap((group) => group.items);
