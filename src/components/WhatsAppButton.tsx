import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export default function WhatsAppButton() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["whatsapp_number", "whatsapp_message"]);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => (map[r.key] = r.value ?? ""));
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (path.startsWith("/admin") || path.startsWith("/auth")) return null;
  let num = (data?.whatsapp_number ?? "").replace(/\D/g, "");
  if (!num) return null;
  if (num.startsWith("01")) num = "88" + num;
  const msg = data?.whatsapp_message || "হ্যালো Gentsity, আমি একটি প্রোডাক্ট সম্পর্কে জানতে চাই।";
  const href = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp-এ চ্যাট করুন"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110"
      style={{ backgroundColor: "#25D366" }}
    >
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="#fff" aria-hidden>
        <path d="M16 3C9 3 3.3 8.7 3.3 15.7c0 2.5.7 4.9 2 7L3 29l6.5-2.2c2 1.1 4.2 1.7 6.5 1.7 7 0 12.7-5.7 12.7-12.7S23 3 16 3zm0 23.2c-2.1 0-4.1-.6-5.9-1.7l-.4-.2-3.9 1.3 1.3-3.8-.3-.4c-1.2-1.8-1.8-3.9-1.8-6 0-5.8 4.8-10.6 10.7-10.6S26.7 9.9 26.7 15.7 21.9 26.2 16 26.2zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z" />
      </svg>
    </a>
  );
}
