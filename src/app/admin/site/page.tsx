"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

type State = { enabled: boolean; updatedAt: string | null; updatedBy: string | null };

export default function SitePage() {
  const { user } = useStore();
  const owner = user?.role === "ADMIN";
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/admin/site");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not load");
      setState(j as State);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Could not load the maintenance setting." });
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async () => {
    if (!state || !owner || busy) return;
    const next = !state.enabled;
    const question = next
      ? "Turn ON maintenance mode?\n\nCustomers will see the maintenance page and cannot check out. Staff can still use the admin and the till."
      : "Turn OFF maintenance mode?\n\nThe public website will be open to customers again.";
    if (!window.confirm(question)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/site", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ kind: "err", text: j.error || "Could not change maintenance mode. Nothing was changed." });
        return;
      }
      setState(j as State);
      setMsg({ kind: "ok", text: next ? "Maintenance mode is ON. Customers see the maintenance page." : "Maintenance mode is OFF. The website is live." });
    } catch {
      setMsg({ kind: "err", text: "Could not reach the server. Nothing was changed. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const on = !!state?.enabled;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-white">Site & maintenance</h2>
        <p className="text-sm text-zinc-400">Use maintenance mode while you update the public website.</p>
      </div>

      {msg && (
        <div role={msg.kind === "err" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm font-semibold ${msg.kind === "err" ? "border-red-500/50 bg-red-500/10 text-red-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"}`}>
          {msg.text}
        </div>
      )}

      <section aria-labelledby="maint-title" className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 id="maint-title" className="font-bold text-white">Maintenance mode</h3>
            <p className="mt-1 text-sm text-zinc-300">
              {!state
                ? "Loading…"
                : on
                  ? "ON. Customers see a maintenance page and cannot check out."
                  : "OFF. The website is live for customers."}
            </p>
            {state?.updatedAt && (
              <p className="mt-1 text-xs text-zinc-500">
                Last changed {new Date(state.updatedAt).toLocaleString("en-GB")}{state.updatedBy ? ` by ${state.updatedBy}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Maintenance mode"
            aria-describedby="maint-help"
            onClick={toggle}
            disabled={!owner || !state || busy}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-50 disabled:cursor-not-allowed ${on ? "bg-amber-400" : "bg-zinc-600"}`}
          >
            <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${on ? "translate-x-7" : "translate-x-1"}`} />
          </button>
        </div>
        <p id="maint-help" className="text-xs text-zinc-400">
          {owner
            ? "Turning this on asks you to confirm first. Staff accounts keep full access to the admin and the till while it is on."
            : "Only the owner can turn maintenance mode on or off."}
        </p>
      </section>
    </div>
  );
}
