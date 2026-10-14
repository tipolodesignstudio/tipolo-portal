import { createRootRoute, createRoute, createRouter, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { Home } from "@/pages/Home";
import { ClientsList } from "@/pages/clients/ClientsList";
import { ClientDetail } from "@/pages/clients/ClientDetail";
import { ProposalsList } from "@/pages/proposals/ProposalsList";
import { ProposalBuilder } from "@/pages/proposals/ProposalBuilder";
import { TemplateEditor, TemplatesList } from "@/pages/proposals/Templates";

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
const templates = createRoute({ getParentRoute: () => root, path: "/proposals/templates", component: TemplatesList });
const template = createRoute({ getParentRoute: () => root, path: "/proposals/templates/$id", component: TemplateEditor, staticData: { fullBleed: true } });
const proposal = createRoute({ getParentRoute: () => root, path: "/proposals/$id", component: ProposalBuilder, staticData: { fullBleed: true } });

export const router = createRouter({
  routeTree: root.addChildren([home, clients, client, proposals, proposal, templates, template]),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
  interface StaticDataRouteOption { fullBleed?: boolean }
}
