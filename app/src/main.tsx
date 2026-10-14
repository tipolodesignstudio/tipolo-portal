import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ConfirmProvider } from "@/components/ui/confirm";
import { router } from "@/router";
import { Login, SetPassword } from "@/pages/Login";
import "./index.css";

// Development only: ?mock runs on sample data with a stand-in session (src/dev/mock.ts).
// import.meta.env.DEV is false in the published build, so this is removed entirely.
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  if (q.has("mock")) sessionStorage.setItem("tipolo.mock", "1");
  if (q.has("live")) sessionStorage.removeItem("tipolo.mock");
  if (sessionStorage.getItem("tipolo.mock")) await import("./dev/mock");
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
});

function Gate() {
  const { session, loading, recovering } = useAuth();
  if (loading) return <div className="grid min-h-full place-items-center text-sm text-ink-faint">Loading…</div>;
  if (session && recovering) return <SetPassword />;
  return session ? <RouterProvider router={router} /> : <Login />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConfirmProvider>
          <Gate />
        </ConfirmProvider>
      </AuthProvider>
      <Toaster position="bottom-right" toastOptions={{ className: "!font-sans !text-sm" }} />
    </QueryClientProvider>
  </StrictMode>,
);
