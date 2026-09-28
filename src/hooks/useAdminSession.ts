import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAdminSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const check = async (s: Session | null) => {
      if (!active) return;
      setSession(s);
      if (!s) {
        setIsAdmin(false);
        setIsStaff(false);
        setLoading(false);
        return;
      }
      const [{ data: adminRow }, { data: staffRow }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", s.user.id)
          .eq("role", "admin")
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", s.user.id)
          .eq("role", "staff")
          .maybeSingle(),
      ]);
      if (!active) return;
      setIsAdmin(Boolean(adminRow));
      setIsStaff(Boolean(staffRow));
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setLoading(true);
      void check(s);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, isAdmin, isStaff, loading };
}
