import {
  CalendarCheck,
  CalendarDays,
  CalendarMinus,
  ChartColumn,
  Clock,
  Fingerprint,
  Timer,
  History,
  Lightbulb,
  Settings,
  Sparkles,
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
      { href: "/insights", label: "Insights", icon: Lightbulb },
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
    items: [
      { href: "/audit", label: "Audit log", icon: History },
      { href: "/whats-new", label: "What's new", icon: Sparkles },
    ],
  },
];

/** Another app in the byTeam family, on its own address. Not a screen of this app, so it is kept apart from the nav items. */
export type FamilyApp = { name: string; description: string; url: string; icon: LucideIcon };

export const familyApps: FamilyApp[] = [{ name: "byBlock", description: "Sales and reservations", url: "https://byblock.bykorp.com", icon: CalendarCheck }];

/** The four screens on the phone tab bar. Everything else is under More. */
export const primaryTabHrefs = ["/today", "/attendance", "/leave", "/payroll"] as const;

export const allNavItems: NavItem[] = navGroups.flatMap((group) => group.items);
