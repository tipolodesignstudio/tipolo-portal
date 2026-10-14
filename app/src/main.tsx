import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/lib/auth";
import { router } from "@/router";
import { Login } from "@/pages/Login";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
});

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <div className="grid min-h-full place-items-center text-sm text-ink-faint">Loading…</div>;
  return session ? <RouterProvider router={router} /> : <Login />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
