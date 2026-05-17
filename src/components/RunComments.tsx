import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, MessageCircle, Trash2 } from "lucide-react";
import { formatClanTag } from "@/lib/format";

type Comment = {
  id: string;
  run_id: string;
  user_id: string;
  body: string;
  created_at: string;
};
type Profile = { user_id: string; display_name: string; clan_tag: string | null; avatar_url: string | null };

export function RunComments({ runId, canComment }: { runId: string; canComment: boolean }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("run_comments")
      .select("id, run_id, user_id, body, created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    const rows = (data as Comment[]) ?? [];
    setComments(rows);
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    if (ids.length) {
      const { data: pData } = await supabase
        .from("profiles")
        .select("user_id, display_name, clan_tag, avatar_url")
        .in("user_id", ids);
      const map: Record<string, Profile> = {};
      ((pData as Profile[]) ?? []).forEach((p) => (map[p.user_id] = p));
      setProfiles(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`run-comments-${runId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "run_comments", filter: `run_id=eq.${runId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  async function post() {
    if (!user || !body.trim()) return;
    setPosting(true);
    const { error } = await supabase.from("run_comments").insert({
      run_id: runId,
      user_id: user.id,
      body: body.trim(),
    });
    setPosting(false);
    if (error) { toast.error(error.message); return; }
    setBody("");
  }

  async function remove(id: string) {
    const { error } = await supabase.from("run_comments").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-primary" />
        <h3 className="font-display text-lg font-bold">Comments</h3>
        <span className="font-mono-num text-xs text-muted-foreground">{comments.length}</span>
      </div>

      {loading ? (
        <p className="font-mono-num text-xs text-muted-foreground">LOADING…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet. Be the first.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const p = profiles[c.user_id];
            const mine = user?.id === c.user_id;
            return (
              <li key={c.id} className="flex gap-3">
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface">
                  {p?.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-bold text-primary">
                      {(p?.display_name ?? "R").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs">
                    {p?.clan_tag && <span className="font-mono-num text-primary">{formatClanTag(p.clan_tag)}</span>}
                    <span className="font-semibold">{p?.display_name ?? "Runner"}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{new Date(c.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    {mine && (
                      <button onClick={() => remove(c.id)} className="ml-auto text-muted-foreground hover:text-destructive" aria-label="Delete comment">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {user ? (
        canComment ? (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 500))}
              placeholder="Add a comment…"
              rows={2}
              maxLength={500}
            />
            <div className="flex items-center justify-between">
              <span className="font-mono-num text-[10px] text-muted-foreground">{body.length}/500</span>
              <Button size="sm" onClick={post} disabled={posting || !body.trim()}>
                {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Post"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
            Comments are open once this run is shared publicly.
          </p>
        )
      ) : (
        <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">Sign in to comment.</p>
      )}
    </section>
  );
}
