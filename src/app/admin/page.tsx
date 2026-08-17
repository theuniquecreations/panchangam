"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Trash2, RefreshCw, ShieldAlert } from "lucide-react";
import {
  getUsers,
  deleteUser,
  BackendNotReadyError,
  SessionExpiredError,
  type UserProfile,
} from "@/lib/api";
import { useSession, useSessionReady } from "@/lib/session";
import { isAdminEmail } from "@/lib/config";

/** Newest first — the useful order when watching sign-ups. */
const sortNewestFirst = (rows: UserProfile[]): UserProfile[] =>
  [...rows].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

const describeLoadError = (err: unknown): string =>
  err instanceof BackendNotReadyError
    ? err.message
    : `Could not load users: ${err instanceof Error ? err.message : "unknown error"}`;

export default function AdminPage() {
  const router = useRouter();
  const session = useSession();
  const sessionReady = useSessionReady();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Row id awaiting confirmation, then the id currently being deleted.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdmin = isAdminEmail(session?.email);

  useEffect(() => {
    if (!sessionReady) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    // Non-admins get sent home rather than shown an empty admin shell.
    if (!isAdminEmail(session.email)) {
      router.replace("/");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const rows = await getUsers();
        if (cancelled) return;
        setUsers(sortNewestFirst(rows));
        setError("");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SessionExpiredError) {
          router.replace("/login");
          return;
        }
        setError(describeLoadError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionReady, session, router]);

  /** Manual refresh from the button — an event handler, so it may show the
   * loading state immediately. */
  const refresh = async () => {
    setLoading(true);
    setNotice("");
    try {
      setUsers(sortNewestFirst(await getUsers()));
      setError("");
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        router.replace("/login");
        return;
      }
      setError(describeLoadError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (user: UserProfile) => {
    if (!user.id) return;
    setDeletingId(user.id);
    setError("");
    setNotice("");
    try {
      await deleteUser(user.id);
      setUsers((list) => list.filter((u) => u.id !== user.id));
      setNotice(`Deleted ${user.email || user.id}.`);
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        router.replace("/login");
        return;
      }
      setError(
        `Could not delete: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  };

  // Nothing renders until the session is known and the email is allowed, so a
  // non-admin never sees this content flash before the redirect.
  if (!sessionReady || !session || !isAdmin) return null;

  return (
    <>
      <div className="section-heading">Admin</div>

      <div className="card admin-summary">
        <Users size={22} className="admin-summary-icon" />
        <div>
          <div className="admin-count">{loading ? "…" : users.length}</div>
          <div className="admin-count-label">
            {users.length === 1 ? "registered user" : "registered users"}
          </div>
        </div>
        <button
          type="button"
          className="admin-refresh"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && !error && <div className="alert alert-success">{notice}</div>}

      <div className="section-heading">Users</div>

      {loading ? (
        <div className="card">
          <p className="card-note">Loading users…</p>
        </div>
      ) : users.length === 0 ? (
        <div className="card">
          <p className="card-note">No users have signed up yet.</p>
        </div>
      ) : (
        <div className="admin-list">
          {users.map((user) => {
            const isConfirming = confirmingId === user.id;
            const isDeleting = deletingId === user.id;
            return (
              <div className="admin-row" key={user.id || user.email}>
                <div className="admin-row-main">
                  <span className="admin-row-name">
                    {user.name?.trim() || "(no name)"}
                  </span>
                  <span className="admin-row-email">{user.email}</span>
                  <span className="admin-row-meta">
                    {[
                      user.birthDate && `born ${user.birthDate}`,
                      user.birthPlace,
                      user.createdAt &&
                        `joined ${new Date(user.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>

                {isConfirming ? (
                  // Deletion is irreversible, so it takes a second, explicit tap.
                  <div className="admin-confirm">
                    <span className="admin-confirm-text">Delete?</span>
                    <button
                      type="button"
                      className="admin-confirm-yes"
                      onClick={() => handleDelete(user)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "…" : "Yes"}
                    </button>
                    <button
                      type="button"
                      className="admin-confirm-no"
                      onClick={() => setConfirmingId(null)}
                      disabled={isDeleting}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="admin-delete"
                    onClick={() => setConfirmingId(user.id || null)}
                    aria-label={`Delete ${user.email}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="card admin-note">
        <ShieldAlert size={16} className="admin-note-icon" />
        <p className="card-note">
          This list is gated in the app only. Enforcing it on the backend needs
          the role claim in the sign-in token checked server-side.
        </p>
      </div>
    </>
  );
}
