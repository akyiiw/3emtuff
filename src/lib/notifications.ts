import { createClient } from "@/lib/supabase/client";

export async function dispatchNotification(
  userId: string,
  type: string,
  title: string,
  body: string | null,
  link: string | null
) {
  const supabase = createClient();
  await supabase.from("notifications").insert({
    user_id: userId,
    type,
    title,
    body,
    link,
  });
}

export async function broadcastNotification(
  excludeUserId: string,
  type: string,
  title: string,
  body: string | null,
  link: string | null
) {
  const supabase = createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .neq("id", excludeUserId);
  const userIds = (profiles ?? []).map((p: { id: string }) => p.id);

  if (userIds.length === 0) return;

  const notifications = userIds.map((uid: string) => ({
    user_id: uid,
    type,
    title,
    body,
    link,
  }));

  await supabase.from("notifications").insert(notifications);
}

export async function notifyPostComment(
  postId: string,
  commentUserId: string
) {
  const supabase = createClient();
  const { data: post } = await supabase
    .from("forum_posts")
    .select("id, title, user_id")
    .eq("id", postId)
    .single();
  if (!post) return;
  if (post.user_id === commentUserId) return;

  await dispatchNotification(
    post.user_id,
    "new_forum_comment",
    `Novo comentário em "${post.title}"`,
    null,
    `/forum/${postId}`
  );
}

export async function notifyNewForumPost(
  excludeUserId: string,
  postId: string,
  postTitle: string
) {
  await broadcastNotification(
    excludeUserId,
    "new_forum_post",
    `Novo post no fórum: ${postTitle}`,
    null,
    `/forum/${postId}`
  );
}

export async function notifyNewItem(
  excludeUserId: string,
  itemId: string,
  itemText: string,
  itemType: string,
  subjectId: string
) {
  const { getSubject } = await import("@/lib/subjects");
  const subj = getSubject(subjectId);
  const emoji = subj?.emoji ?? "📚";
  const label = subj?.name ?? "Geral";
  const typeLabel = itemType === "exam" ? "Prova" : itemType === "work" ? "Trabalho" : "Atividade";
  const notifType = itemType === "exam" ? "new_exam" : "new_item";

  await broadcastNotification(
    excludeUserId,
    notifType,
    `${emoji} ${typeLabel}: ${itemText}`,
    `${label}`,
    `/dashboard/${subjectId}?item=${itemId}`
  );
}
