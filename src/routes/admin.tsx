import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminSession } from "@/hooks/useAdminSession";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "অ্যাডমিন প্যানেল — Gentsity" },
      { name: "description", content: "অর্ডার, স্টক ও সেটিংস ম্যানেজমেন্ট।" },
      { property: "og:title", content: "অ্যাডমিন প্যানেল — Gentsity" },
      { property: "og:description", content: "অর্ডার, স্টক ও সেটিংস ম্যানেজমেন্ট।" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

/** শুধু অ্যাডমিনের জন্য পেজ র‍্যাপার — স্টাফ ঢুকলে "অনুমতি নেই" দেখায়। */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAdminSession();
  if (loading) {
    return <div className="p-10 text-center text-muted-foreground">লোড হচ্ছে…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-xl font-bold">অনুমতি নেই</h1>
        <p className="mt-2 text-sm text-muted-foreground">এই পেজটি শুধু অ্যাডমিনের জন্য।</p>
      </div>
    );
  }
  return <>{children}</>;
}

function AdminLayout() {
  const { session, isAdmin, isStaff, loading } = useAdminSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading) {
    return <div className="p-10 text-center text-muted-foreground">লোড হচ্ছে…</div>;
  }

  if (session && !isAdmin && !isStaff) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="text-xl font-bold">অনুমতি নেই</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          এই অ্যাকাউন্টটি অ্যাডমিন বা স্টাফ নয়। সঠিক ইমেইল দিয়ে লগইন করুন।
        </p>
        <Button
          className="mt-5"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
        >
          লগ আউট
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="font-display text-xl font-extrabold text-primary">Gentsity</span>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            <Link
              to="/admin"
              activeOptions={{ exact: true }}
              activeProps={{ className: "bg-secondary font-semibold" }}
              className="rounded-md px-3 py-2"
            >
              অর্ডার
            </Link>
            <Link
              to="/admin/stock"
              activeProps={{ className: "bg-secondary font-semibold" }}
              className="rounded-md px-3 py-2"
            >
              পোলো স্টক
            </Link>
            <Link
              to="/admin/pajama-stock"
              activeProps={{ className: "bg-secondary font-semibold" }}
              className="rounded-md px-3 py-2"
            >
              পায়জামা স্টক
            </Link>
            <Link
              to="/admin/sneakers-stock"
              activeProps={{ className: "bg-secondary font-semibold" }}
              className="rounded-md px-3 py-2"
            >
              স্নিকার্স স্টক
            </Link>
            <Link
              to="/admin/sweatshirt-stock"
              activeProps={{ className: "bg-secondary font-semibold" }}
              className="rounded-md px-3 py-2"
            >
              সোয়েটশার্ট স্টক
            </Link>
            <Link to="/admin/hoodie-combo-stock" activeProps={{ className: "bg-secondary font-semibold" }} className="rounded-md px-3 py-2">হুডি কম্বো স্টক</Link>
            {isAdmin && (
              <>
                <Link
                  to="/admin/abandoned"
                  activeProps={{ className: "bg-secondary font-semibold" }}
                  className="rounded-md px-3 py-2"
                >
                  অসম্পূর্ণ অর্ডার
                </Link>
                <Link
                  to="/admin/blocked"
                  activeProps={{ className: "bg-secondary font-semibold" }}
                  className="rounded-md px-3 py-2"
                >
                  আইপি ব্লক
                </Link>
                <Link
                  to="/admin/settings"
                  activeProps={{ className: "bg-secondary font-semibold" }}
                  className="rounded-md px-3 py-2"
                >
                  সেটিংস
                </Link>
              </>
            )}
          </nav>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            লগ আউট
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
