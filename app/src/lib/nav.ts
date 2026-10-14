import {
  LayoutDashboard, Users, FileText, FolderKanban, Clock, Receipt, Wallet, Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; icon: LucideIcon; to: string };

export const NAV: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { label: "Clients", icon: Users, to: "/clients" },
  { label: "Proposals", icon: FileText, to: "/proposals" },
  { label: "Projects", icon: FolderKanban, to: "/projects" },
  { label: "Timesheets", icon: Clock, to: "/timesheets" },
  { label: "Invoices", icon: Receipt, to: "/invoices" },
  { label: "Income & Expenses", icon: Wallet, to: "/expenses" },
  { label: "Settings", icon: Settings, to: "/settings" },
];
