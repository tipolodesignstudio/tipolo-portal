import { createRootRoute, createRoute, createRouter, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { Home } from "@/pages/Home";

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

export const router = createRouter({
  routeTree: root.addChildren([home]),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
