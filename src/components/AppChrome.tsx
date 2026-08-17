"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sun, User, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { BRAND_TITLE, BRAND_TAGLINE, isAdminEmail } from "@/lib/config";
import { useSession, useSessionReady, clearSession } from "@/lib/session";
import { clearCachedProfile } from "@/lib/profile-cache";

// Top bar. The session lives in browser storage, so it is read through
// useSyncExternalStore: the server snapshot is null and the real value lands
// after hydration, which keeps the markup consistent.
export function AppBar() {
  const router = useRouter();
  const session = useSession();
  const ready = useSessionReady();

  const handleLogout = () => {
    clearSession();
    // Drop the pending-write cache too, so the next person to sign in on this
    // device cannot be shown the previous user's unsynced profile.
    clearCachedProfile();
    router.push("/");
  };

  return (
    <header className="app-bar">
      <div className="app-bar-brand">
        <h1 className="app-bar-title">{BRAND_TITLE}</h1>
        <span className="app-bar-tagline">{BRAND_TAGLINE}</span>
      </div>
      {ready &&
        (session ? (
          <button type="button" className="app-bar-action" onClick={handleLogout}>
            <LogOut size={13} />
            Sign out
          </button>
        ) : (
          <Link href="/login" className="app-bar-action">
            <LogIn size={13} />
            Sign in
          </Link>
        ))}
    </header>
  );
}

// Bottom tab bar — the primary navigation once this runs inside the RN WebView.
export function TabBar() {
  const pathname = usePathname();
  const session = useSession();

  const tabs = [
    { href: "/", label: "Panchangam", Icon: Sun },
    { href: "/profile", label: "Profile", Icon: User },
    // Only surfaced for the configured admin accounts. The page re-checks on
    // load, so hiding the tab is convenience, not the gate.
    ...(isAdminEmail(session?.email)
      ? [{ href: "/admin", label: "Admin", Icon: ShieldCheck }]
      : []),
  ];

  return (
    <nav className="tab-bar">
      {tabs.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`tab-item ${pathname === href ? "active" : ""}`}
        >
          <Icon size={19} strokeWidth={2} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
