import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Permanently delete the currently authenticated user's account.
 *
 * Required for Apple App Store compliance (guideline 5.1.1(v)).
 * Runs server-side with the service role key — the only way to call
 * `auth.admin.deleteUser` safely.
 */
export const deleteOwnAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // Best-effort cleanup of user-owned rows. The auth user delete that
    // follows will also cascade where FKs are configured, but we wipe the
    // big public-facing tables explicitly so nothing lingers if a cascade
    // is missing.
    await Promise.allSettled([
      supabaseAdmin.from("run_comments").delete().eq("user_id", userId),
      supabaseAdmin.from("user_challenge_progress").delete().eq("user_id", userId),
      supabaseAdmin.from("user_achievements").delete().eq("user_id", userId),
      supabaseAdmin.from("saved_routes").delete().eq("user_id", userId),
      supabaseAdmin.from("saved_views").delete().eq("user_id", userId),
      supabaseAdmin.from("medals").delete().eq("user_id", userId),
      supabaseAdmin.from("runs").delete().eq("user_id", userId),
      supabaseAdmin.from("routes").delete().eq("user_id", userId),
      supabaseAdmin.from("group_members").delete().eq("user_id", userId),
      supabaseAdmin.from("user_stats").delete().eq("user_id", userId),
      supabaseAdmin.from("profiles").delete().eq("user_id", userId),
    ]);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("deleteOwnAccount: auth.admin.deleteUser failed", error);
      throw new Error("Failed to delete account. Please contact support.");
    }

    return { success: true } as const;
  });
