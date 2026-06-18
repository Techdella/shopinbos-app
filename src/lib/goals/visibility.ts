export interface GoalVisibilityRecord {
  title?: string | null;
  description?: string | null;
  ownerId?: string | null;
  assigneeId?: string | null;
  assigneeIds?: string[] | null;
  keyResults?: Array<{ title?: string | null; description?: string | null; ownerId?: string | null; assigneeId?: string | null; assigneeIds?: string[] | null }> | null;
}

export interface GoalViewer {
  id: string;
  name?: string | null;
  email?: string | null;
}

function mentioned(text: string | null | undefined, viewer: GoalViewer) {
  const haystack = text?.toLowerCase() ?? "";
  const names = [viewer.name, viewer.email]
    .filter((value): value is string => !!value)
    .flatMap((value) => [value, ...value.split(/\s+/)])
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length >= 2);

  return names.some((name) => haystack.includes(name));
}

function assigned(record: Pick<GoalVisibilityRecord, "ownerId" | "assigneeId" | "assigneeIds">, viewer: GoalViewer) {
  return record.ownerId === viewer.id || record.assigneeId === viewer.id || !!record.assigneeIds?.includes(viewer.id);
}

export function canViewGoal(goal: GoalVisibilityRecord, viewer: GoalViewer) {
  if (assigned(goal, viewer)) return true;
  if (mentioned(goal.title, viewer) || mentioned(goal.description, viewer)) return true;

  return (goal.keyResults ?? []).some((kr) => (
    assigned(kr, viewer) ||
    mentioned(kr.title, viewer) ||
    mentioned(kr.description, viewer)
  ));
}

export function filterVisibleGoals<T extends GoalVisibilityRecord>(goals: T[], viewer: GoalViewer) {
  return goals.filter((goal) => canViewGoal(goal, viewer));
}
