import {
  LayoutDashboard, Users, FileText, FolderKanban, Clock, Receipt, Wallet, Settings,
  type LucideIcon,
} from "lucide-react";

/* `to` is a screen rebuilt in the new app; `legacy` opens the current portal's version
   until it is. Moving a screen across is a one-line change here. */
export type NavItem = { label: string; icon: LucideIcon; to?: string; legacy?: string };

export const NAV: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { label: "Clients", icon: Users, to: "/clients" },
  { label: "Proposals", icon: FileText, to: "/proposals" },
  { label: "Projects", icon: FolderKanban, to: "/projects" },
  { label: "Timesheets", icon: Clock, to: "/timesheets" },
  { label: "Invoices", icon: Receipt, legacy: "/invoices" },
  { label: "Income & Expenses", icon: Wallet, legacy: "/expenses" },
  { label: "Settings", icon: Settings, legacy: "/settings" },
];
