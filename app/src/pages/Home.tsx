// Dashboard: where the studio stands. Money owed and waiting to be billed, the proposal
// pipeline, this week's hours, the year's income against expenses, and how each active
// project is doing against its budget.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { hours, localISO, money } from "@/lib/format";
import { Card, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { projectsQuery } from "@/lib/data/projects";
import { effectiveStatus, invoicesQuery } from "@/lib/data/invoices";
import { proposalsQuery } from "@/lib/data/proposals";
import { expensesQuery, incomeQuery } from "@/lib/data/books";
import { mondayOf, weekQuery } from "@/lib/data/time";
import { BudgetBar } from "@/pages/projects/ProjectsList";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NO_FILTER = { projectId: "", categoryId: "", billable: "", billed: "" } as const;

function Stat({ label, value, sub, to, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; to?: string; tone?: "bad" | "warn" }) {
  const body = (
    <Card className={cn("h-full py-4 transition-shadow", to && "group-hover:shadow-md")}>
      <div className="text-[11.5px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={cn("mt-1 font-heading text-2xl tabular-nums", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{value}</div>
      {sub && <div className="mt-0.5 text-[12.5px] text-ink-soft">{sub}</div>}
    </Card>
  );
  return to ? <Link to={to} className="group block">{body}</Link> : body;
}

export function Home() {
  const { session } = useAuth();
  const [now] = React.useState(() => new Date());
  const today = localISO(now);
  const year = String(now.getFullYear());
  const monday = localISO(mondayOf(now));

  const projects = useQuery(projectsQuery({ search: "", status: "open", scope: "" }));
  const invoices = useQuery(invoicesQuery(""));
  const proposals = useQuery(proposalsQuery(""));
  const income = useQuery(incomeQuery);
  const expenses = useQuery(expensesQuery({ ...NO_FILTER }));
  const week = useQuery(weekQuery(monday, { projectId: "", billable: "", billed: "", mine: false }, session?.user.id));

  const inv = invoices.data ?? [];
  const sent = inv.filter((i) => i.status === "sent");
  const overdue = sent.filter((i) => effectiveStatus(i) === "overdue");
  const sum = <T,>(l: T[], f: (x: T) => unknown) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const unbilled = sum(projects.data ?? [], (p) => p.rollup.unbilledValue);
  const open = (proposals.data ?? []).filter((p) => p.status === "draft" || p.status === "sent");
  const decided = (proposals.data ?? []).filter((p) => p.status === "accepted" || p.status === "declined");
  const won = decided.filter((p) => p.status === "accepted").length;
  const inc = (income.data ?? []).filter((i) => i.income_date.startsWith(year));
  const exp = (expenses.data ?? []).filter((e) => e.expense_date.startsWith(year));
  const weekMin = sum(week.data ?? [], (e) => e.minutes);
  const weekBillable = sum((week.data ?? []).filter((e) => e.billable), (e) => e.minutes);
  const incomeYear = sum(inc, (i) => i.amount);
  const expenseYear = sum(exp, (e) => e.amount);

  const monthly = MONTH.map((m, k) => {
    const key = `${year}-${String(k + 1).padStart(2, "0")}`;
    return { month: m, Income: sum(inc.filter((i) => i.income_date.startsWith(key)), (i) => i.amount), Expenses: sum(exp.filter((e) => e.expense_date.startsWith(key)), (e) => e.amount) };
  }).slice(0, now.getMonth() + 1);

  const active = (projects.data ?? []).filter((p) => p.status === "active" || p.status === "lead" || p.status === "on_hold")
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));

  const handle = session?.user.email?.split("@")[0] ?? "";
  const first = handle ? handle[0].toUpperCase() + handle.slice(1) : "";
  const err = [projects, invoices, proposals, income, expenses].find((q) => q.error)?.error as Error | undefined;
  const shortDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });

  return (
    <div className="space-y-6">
      <header>
        <div className="text-sm text-ink-faint">{now.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}</div>
        <h1 className="mt-1 text-3xl">Good to see you{first ? `, ${first}` : ""}</h1>
      </header>

      {err && <div className="rounded-md bg-bad-bg px-4 py-3 text-sm text-bad">Couldn't load everything: {err.message}</div>}

      {overdue.length > 0 && (
        <Link to="/invoices" className="flex items-center gap-2 rounded-md bg-bad-bg px-4 py-3 text-sm text-bad hover:underline">
          <AlertTriangle className="size-4" />
          {overdue.length} invoice{overdue.length === 1 ? " is" : "s are"} overdue — {money(sum(overdue, (i) => i.total))} past due.
          <ArrowRight className="ml-auto size-4" />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Owed to the studio" value={money(sum(sent, (i) => i.total))} sub={`${sent.length} invoice${sent.length === 1 ? "" : "s"} sent, unpaid`} to="/invoices" tone={overdue.length ? "bad" : undefined} />
        <Stat label="Not yet invoiced" value={money(unbilled)} sub="billable time on open projects" to="/projects" tone={unbilled > 0 ? "warn" : undefined} />
        <Stat label="Proposal pipeline" value={money(sum(open, (p) => p.subtotal))} sub={`${open.length} open${decided.length ? ` · ${Math.round((won / decided.length) * 100)}% won` : ""}`} to="/proposals" />
        <Stat label="Hours this week" value={hours(weekMin)} sub={weekMin ? `${Math.round((weekBillable / weekMin) * 100)}% billable` : "nothing logged yet"} to="/timesheets" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <div className="flex items-baseline justify-between">
            <CardTitle>Income and expenses, {year}</CardTitle>
            <Link to="/expenses" className="text-[12.5px] text-accent hover:underline">Income &amp; Expenses</Link>
          </div>
          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#E6E1D3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#7C8A6B", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: "#7C8A6B", fontSize: 12 }} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "rgba(63,74,32,0.05)" }} contentStyle={{ borderRadius: 8, border: "1px solid #D8D3C4", fontSize: 13 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Income" fill="#3F4A20" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Expenses" fill="#B8A88A" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <div className="grid gap-4">
          <Stat label={`Income ${year}`} value={money(incomeYear)} to="/expenses" />
          <Stat label={`Expenses ${year}`} value={money(expenseYear)} to="/expenses" />
          <Stat label="Net" value={money(incomeYear - expenseYear)} sub="income − expenses" tone={incomeYear < expenseYear ? "bad" : undefined} />
        </div>
      </div>

      <Card className="p-0">
        <div className="flex items-baseline justify-between px-5 pt-5">
          <CardTitle>Active projects</CardTitle>
          <Link to="/projects" className="text-[12.5px] text-accent hover:underline">All projects</Link>
        </div>
        {active.length ? (
          <ul className="mt-3 divide-y divide-border/70 border-t border-border/70">
            {active.map((p) => (
              <li key={p.id}>
                <Link to="/projects/$id" params={{ id: p.id }} className="grid grid-cols-[56px_1fr_auto] items-center gap-4 px-5 py-3 text-sm hover:bg-bg/60 sm:grid-cols-[56px_1fr_220px_70px_90px]">
                  <span className="tabular-nums text-ink-faint">{p.number}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.title}</span>
                    <span className={cn("block truncate text-[12px]", p.due_date && p.due_date < today ? "text-bad" : "text-ink-faint")}>
                      {p.client?.name}{p.due_date ? ` · due ${shortDate(p.due_date)}` : ""}{p.due_date && p.due_date < today ? " (past)" : ""}
                    </span>
                  </span>
                  <BudgetBar className="hidden sm:block" billed={p.rollup.billed} budget={p.rollup.budget} />
                  <span className="hidden text-right tabular-nums text-ink-soft sm:block">{hours(p.rollup.minutes)} h</span>
                  <span className="justify-self-end"><StatusBadge status={p.status} /></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 pb-5 pt-2 text-sm text-ink-faint">No active projects. Convert an accepted proposal to start one.</p>}
      </Card>
    </div>
  );
}
