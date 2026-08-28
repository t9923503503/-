import type { PlayPostView } from '@/lib/play-service';

export type ProfilePlayGroup = 'upcoming' | 'reserve' | 'completed' | 'cancelled';

export interface GroupedProfilePlayEntries {
  upcoming: PlayPostView[];
  reserve: PlayPostView[];
  completed: PlayPostView[];
  cancelled: PlayPostView[];
}

export function isActivePlayEntry(post: PlayPostView, now = Date.now()): boolean {
  return (
    post.status !== 'cancelled' &&
    post.status !== 'completed' &&
    post.viewerStatus !== 'cancelled' &&
    post.viewerStatus !== 'rejected' &&
    new Date(post.endsAt).getTime() >= now
  );
}

export function classifyProfilePlayEntry(post: PlayPostView, now = Date.now()): ProfilePlayGroup {
  if (post.status === 'cancelled' || ['cancelled', 'rejected'].includes(String(post.viewerStatus))) return 'cancelled';
  if (isActivePlayEntry(post, now) && post.viewerStatus === 'reserve') return 'reserve';
  if (isActivePlayEntry(post, now)) return 'upcoming';
  return 'completed';
}

export function groupProfilePlayEntries(
  posts: PlayPostView[],
  now = Date.now()
): GroupedProfilePlayEntries {
  const groups: GroupedProfilePlayEntries = {
    upcoming: [],
    reserve: [],
    completed: [],
    cancelled: [],
  };

  for (const post of posts) groups[classifyProfilePlayEntry(post, now)].push(post);

  const ascending = (left: PlayPostView, right: PlayPostView) =>
    new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
  const descending = (left: PlayPostView, right: PlayPostView) => -ascending(left, right);
  groups.upcoming.sort(ascending);
  groups.reserve.sort(ascending);
  groups.completed.sort(descending);
  groups.cancelled.sort(descending);
  return groups;
}
