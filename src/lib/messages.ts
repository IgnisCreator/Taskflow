// The wording of the screens that are shared or repeated, in one place and in English. A translation
// later means providing the same shape in another language and picking it per user; the pages that
// do not read from here yet keep their text inline (see the backlog).

export const messages = {
  errors: {
    conflict:
      "The board changed in the meantime. The page was refreshed; try again.",
    network: "Could not reach the server. Check your connection and retry.",
    generic: "Something went wrong",
  },
  board: {
    updatedByOthers: "The board was updated by someone else.",
    noTasks: "No tasks",
    noMatches: "No tasks match these filters.",
    addTask: "Add task",
    /** The alert of a stage over its WIP limit, with the reason limits exist. */
    overLimit: (count: number, limit: number) =>
      `Over the WIP limit (${count} of ${limit}). Too much work started at once slows everything down: finish something before pulling more in.`,
  },
  views: {
    board: "Board",
    list: "List",
    label: "View",
  },
  filters: {
    label: "Filter tasks",
    search: "Search",
    searchHint: "Title or description",
    assignee: "Assignee",
    anyone: "Anyone",
    unassigned: "Unassigned",
    priority: "Priority",
    anyPriority: "Any",
    type: "Type",
    anyType: "Any type",
    noType: "No type",
    labelField: "Label",
    anyLabel: "Any label",
    blocked: "Blocked",
    anyBlocked: "Blocked or not",
    onlyBlocked: "Only blocked",
    notBlocked: "Not blocked",
    apply: "Apply",
    clear: "Clear",
  },
  table: {
    caption: "Tasks of this list",
    title: "Title",
    stage: "Stage",
    priority: "Priority",
    type: "Type",
    assignees: "Assignees",
    labels: "Labels",
    due: "Due",
    status: "Status",
    newTask: "New task",
    empty: "There are no tasks yet.",
    sortedBy: (column: string, dir: "asc" | "desc") =>
      `Sorted by ${column}, ${dir === "asc" ? "ascending" : "descending"}`,
  },
} as const;
