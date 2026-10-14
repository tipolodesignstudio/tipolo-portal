import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { Home } from "@/pages/Home";
import { ClientsList } from "@/pages/clients/ClientsList";
import { ClientDetail } from "@/pages/clients/ClientDetail";
import { ProposalsList } from "@/pages/proposals/ProposalsList";
import { ProjectsList } from "@/pages/projects/ProjectsList";
import { ProjectDetail } from "@/pages/projects/ProjectDetail";
import { Timesheets } from "@/pages/Timesheets";
import { InvoicesList } from "@/pages/invoices/InvoicesList";
const IncomeExpenses = lazyRouteComponent(() => import("@/pages/books/IncomeExpenses"), "IncomeExpenses");
const InvoiceBuilder = lazyRouteComponent(() => import("@/pages/invoices/InvoiceBuilder"), "InvoiceBuilder");

// The builder, templates and importers carry the print code and the PDF reader, so they
// load when first opened rather than with every page.
const ProposalBuilder = lazyRouteComponent(() => import("@/pages/proposals/ProposalBuilder"), "ProposalBuilder");
const TemplatesList = lazyRouteComponent(() => import("@/pages/proposals/Templates"), "TemplatesList");
const TemplateEditor = lazyRouteComponent(() => import("@/pages/proposals/Templates"), "TemplateEditor");
const ImportPdf = lazyRouteComponent(() => import("@/pages/proposals/ImportPdf"), "ImportPdf");
const FromDrive = lazyRouteComponent(() => import("@/pages/proposals/FromDrive"), "FromDrive");

const root = createRootRoute({
  component: AppShell,
  notFoundComponent: () => (
    <div className="py-20 text-center">
      <h1 className="text-2xl">Nothing here</h1>
      <p className="mt-2 text-sm text-ink-soft">That page hasn't been built in the new portal yet.</p>
      <Link to="/" className="mt-4 inline-block text-sm text-accent underline">Back to the dashboard</Link>
    </div>
  ),
});

const home = createRoute({ getParentRoute: () => root, path: "/", component: Home });
const clients = createRoute({ getParentRoute: () => root, path: "/clients", component: ClientsList });
const client = createRoute({ getParentRoute: () => root, path: "/clients/$id", component: ClientDetail });
const proposals = createRoute({ getParentRoute: () => root, path: "/proposals", component: ProposalsList });
// the builder uses the whole window, beside the sidebar
const projects = createRoute({ getParentRoute: () => root, path: "/projects", component: ProjectsList });
const project = createRoute({
  getParentRoute: () => root, path: "/projects/$id", component: ProjectDetail,
  validateSearch: (s: Record<string, unknown>): { tab?: string } => (typeof s.tab === "string" ? { tab: s.tab } : {}),
});
const invoices = createRoute({ getParentRoute: () => root, path: "/invoices", component: InvoicesList });
const invoice = createRoute({ getParentRoute: () => root, path: "/invoices/$id", component: InvoiceBuilder, staticData: { fullBleed: true } });
const books = createRoute({ getParentRoute: () => root, path: "/expenses", component: IncomeExpenses });
const timesheets = createRoute({ getParentRoute: () => root, path: "/timesheets", component: Timesheets });
const importPdf = createRoute({ getParentRoute: () => root, path: "/proposals/import", component: ImportPdf });
const fromDrive = createRoute({ getParentRoute: () => root, path: "/proposals/from-drive", component: FromDrive });
const templates = createRoute({ getParentRoute: () => root, path: "/proposals/templates", component: TemplatesList });
const template = createRoute({ getParentRoute: () => root, path: "/proposals/templates/$id", component: TemplateEditor, staticData: { fullBleed: true } });
const proposal = createRoute({ getParentRoute: () => root, path: "/proposals/$id", component: ProposalBuilder, staticData: { fullBleed: true } });

export const router = createRouter({
  routeTree: root.addChildren([home, clients, client, proposals, proposal, templates, template, importPdf, fromDrive, projects, project, timesheets, invoices, invoice, books]),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
  interface StaticDataRouteOption { fullBleed?: boolean }
}
