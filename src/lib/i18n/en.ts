import { METRIC_HELP, type MetricKey } from "@/lib/metric-help";

// The wording of the interface, in English: the source of truth. `es.ts` must have the same shape
// (it is typed as `Catalog`), so a key missing from one language does not compile. Text with numbers
// or names is a function. What people type (tasks, lists, comments, stage names) is never translated.

export const en = {
  language: { label: "Language", en: "English", es: "Español" },
  nav: {
    skip: "Skip to content",
    main: "Main",
    workspaces: "Workspaces",
    notifications: "Notifications",
    profile: "Profile",
    signIn: "Sign in",
    unread: (n: number) => `${n} unread`,
  },
  theme: {
    auto: "Auto",
    light: "Light",
    dark: "Dark",
    button: (mode: string) => `Theme: ${mode}`,
    switchTo: (current: string, next: string) =>
      `Theme: ${current}. Switch to ${next}`,
  },
  meta: { description: "Collaborative Kanban project manager" },
  roles: { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member", GUEST: "Guest" },
  demo: {
    explore: "Explore the demo",
    caption:
      "The demo opens your own sandbox with made-up data. You can change anything in it; it is deleted after 24 hours.",
    limit:
      "Too many attempts to open the demo from this address. Try again later.",
    busy: "The demo is full right now. Try again in a little while.",
    banner: (until: string) =>
      `This is your own demo space, with made-up data. It is deleted on ${until} UTC, 24 hours after you opened it.`,
    restart: "Restart demo",
    leave: "Leave and delete it",
  },
  landing: {
    badge: "Kanban for small teams",
    title: "See what your team is working on, at a glance",
    intro:
      "TaskFlow is a Kanban tool for teams. Organise your work in spaces and lists, add tasks, and move them from idea to done together.",
    goToWorkspaces: "Go to your workspaces",
    signIn: "Sign in",
    signInGithub: "Sign in with GitHub",
    whatIsKanban: "What is Kanban?",
    kanbanText:
      "Kanban (Japanese for “signboard”) is a way to manage work with a board. It started in Toyota factories in the 1940s and 1950s, where cards told each station what to make next, and software teams adopted it later. The board has columns for the stages of your work; each task is a card that moves through them.",
    exampleLabel:
      "Example board: To do has two cards, In progress has one, Done has two.",
    exampleColumns: [
      { name: "To do", cards: ["Write the report", "Book the venue"] },
      { name: "In progress", cards: ["Design the poster"] },
      { name: "Done", cards: ["Pick a date", "Invite the team"] },
    ],
    step: (n: number) => `Step ${n}`,
    principles: [
      {
        title: "Make the work visible",
        text: "Every task is a card on a board, so nothing hides in someone's head or inbox.",
      },
      {
        title: "Limit what is in progress",
        text: "Fewer things started at once means more things actually finished. Kanban teams cap each column.",
      },
      {
        title: "Watch the flow",
        text: "Cards move left to right. Where they pile up is where the process is stuck.",
      },
    ],
    note: "TaskFlow gives you the board, the cards and the flow. It does not enforce limits per column yet; that part is up to the team.",
    doesTitle: "What TaskFlow does",
    features: [
      {
        title: "Shared boards",
        text: "Bring up to 20 people into a workspace, with spaces, folders and lists. Everyone sees the same boards and changes show up within seconds.",
      },
      {
        title: "Roles that make sense",
        text: "Admins manage the team, members move and edit tasks, viewers only read. The server enforces it, not just the buttons.",
      },
      {
        title: "Drag, or use the keyboard",
        text: "Drag cards between columns, or pick a column and position from the task dialog. Both work with a keyboard.",
      },
      {
        title: "Find things fast",
        text: "Search by title or description and filter by assignee or priority. Filters live in the URL, so you can share them.",
      },
      {
        title: "No lost edits",
        text: "If two people change the board at once, nobody is overwritten silently: you are told and your text is kept.",
      },
      {
        title: "Light and dark",
        text: "Follows your system theme, or pick one from the header.",
      },
    ],
    readyTitle: "Ready to try it?",
    readyText:
      "Sign in, create a workspace, and every new list starts with four columns.",
  },
  login: {
    title: "Sign in",
    orEmail: "or use your email",
    name: "Name",
    email: "Email",
    password: "Password",
    atLeast10: "At least 10 characters.",
    digestOptIn: "Send me a daily summary of the alerts of my lists",
    create: "Create account",
    signInEmail: "Sign in with email",
    haveAccount: "I already have an account",
    createWithEmail: "Create an account with email",
    sent: (email: string) =>
      `Check your inbox: we sent a confirmation link to ${email}. Open it to finish; then you can sign in.`,
    signOut: "Sign out",
    failed: "Something went wrong. Try again.",
    /** What the sign-in service answers, by its error code. */
    authErrors: {
      INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
      USER_ALREADY_EXISTS: "User already exists. Use another email.",
      PASSWORD_TOO_SHORT: "Password too short",
      PASSWORD_TOO_LONG: "Password too long",
      INVALID_PASSWORD: "Invalid password",
      EMAIL_NOT_VERIFIED: "Email not verified",
      INVALID_EMAIL: "Invalid email",
    },
  },
  profile: {
    title: "Profile",
    joinHint: "To join a workspace, give its admin the email you sign in with.",
    save: "Save",
    dailyEmail: "Daily email",
    dailyEmailLabel:
      "Email me the open alerts once a day (they are always in Notifications)",
    changePassword: "Change password",
    currentPassword: "Current password",
    newPassword: "New password",
    repeatPassword: "Repeat the new password",
    passwordHint: "At least 10 characters. Your other sessions are signed out.",
    mismatch: "The new passwords do not match.",
    changeFailed: "Could not change the password.",
    changed: "Password changed.",
  },
  notifications: {
    title: "Notifications",
    markAll: "Mark all as read",
    markOne: "Mark as read",
    read: "Read",
    intro:
      "Once a day TaskFlow checks every list for early signs of a bottleneck. An alert stays here while the problem holds and moves to Resolved when it stops.",
    none: "No open alerts. Flow looks healthy.",
    seeMetrics: (list: string) => `${list}: see the metrics`,
    resolved: "Resolved",
  },
  workspaces: {
    title: "Workspaces",
    none: "You are not in any workspace yet. Create one below, or ask an admin to add you with the email you sign in with.",
    newTitle: "New workspace",
    newHint: "You will be its owner. It starts with one public space, General.",
    name: "Name",
    create: "Create workspace",
  },
  errors: {
    conflict:
      "The board changed in the meantime. The page was refreshed; try again.",
    network: "Could not reach the server. Check your connection and retry.",
    generic: "Something went wrong",
    /** What the API answers, by its error code; a code not listed shows the server's own message. */
    codes: {
      UNAUTHENTICATED: "Sign in required",
      FORBIDDEN: "Not allowed",
      NOT_FOUND: "Not found",
      CSRF_ORIGIN: "Origin not allowed",
      RATE_LIMITED: "Too many requests. Try again in a moment.",
      DEMO_RESTRICTED: "This is not available in the demo",
      INVALID_JSON: "Body must be valid JSON",
      INTERNAL: "Unexpected error",
    },
    pageTitle: "Something went wrong",
    pageBody: "The page could not be loaded. Your data was not changed.",
    retry: "Try again",
    notFoundTitle: "Not found",
    notFoundBody: "This page does not exist, or you do not have access to it.",
    backToWorkspaces: "Back to workspaces",
  },
  /** "Type <name> to confirm": the name goes between the two parts. */
  confirm: { typeBefore: "Type ", typeAfter: " to confirm" },
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
  units: { days: (n: string) => `${n} days` },
  categories: {
    BACKLOG: "To do",
    ACTIVE: "Active",
    WAITING: "Waiting",
    DONE: "Done",
    DISCARDED: "Discarded",
  },
  priorities: { LOW: "Low", MEDIUM: "Medium", HIGH: "High" },
  shell: {
    nav: "Workspace",
    settings: "Settings",
    switchWorkspace: "Switch workspace",
    noSpaces: "No spaces you can see yet.",
    empty: "Empty",
    private: "private",
    privateSr: " (private)",
    foldSummary: (workspace: string) => `${workspace}: spaces and lists`,
    metricsOf: (name: string) => `Metrics of ${name}`,
    manage: (name: string) => `Manage ${name}`,
  },
  workspace: {
    noSpaces:
      "There are no spaces you can see yet. An admin can add you to one.",
    last30: (space: string) => `Last 30 days in ${space}`,
    finished: "Finished",
    medianCycle: "Median cycle",
    inProgress: "In progress",
    noLists: "No lists yet.",
    createList: "Create list",
    newList: "New list",
    workflow: "Workflow",
    defaultFlow: "Default for this space or folder",
    folder: "Folder",
    noFolder: "No folder",
    newSpace: "New space",
    newSpaceHint:
      "A space groups the lists of one area, such as Software or Support.",
    name: "Name",
    privateLabel: "Private: only admins and the people you add can see it",
    createSpace: "Create space",
  },
  settings: {
    title: "Workspace settings",
    nameHeading: "Name",
    workspaceName: "Workspace name",
    saveName: "Save name",
    onlyAdmins: "Only the owner and admins can change these settings.",
    templatesTitle: "Flow templates",
    templatesHelp:
      "Flows saved from a list (use “Save as template” on a list workflow page). The system templates are always available and cannot be edited.",
    noTemplates: "No templates saved yet.",
    templateName: "Template name",
    rename: "Rename",
    stages: (n: number) => `${n} stages`,
    deleteNamed: (name: string) => `Delete ${name}`,
    roleNamesTitle: "Role names",
    roleNamesHelp:
      "Call the roles what your team calls them, for example Client instead of Guest. Permissions do not change. Leave a field empty to use the default name.",
    saveRoleNames: "Save role names",
    deleteWorkspace: "Delete workspace",
    deleteWorkspaceHint:
      "This permanently deletes every space, list and task in it.",
  },
  catalog: {
    nothing: "Nothing here yet.",
    rename: "Rename",
    types: {
      title: "Task types",
      help: "The kinds of work your team handles (a task, a bug, a request...). Metrics can be split by type.",
      nameOf: "Name of the task type",
      newOne: "New task type",
      add: "Add task type",
    },
    labels: {
      title: "Labels",
      help: "Free tags any task can carry, to group work across lists.",
      nameOf: "Name of the label",
      newOne: "New label",
      add: "Add label",
    },
  },
  members: {
    title: "Members",
    roleOf: (name: string) => `Role of ${name}`,
    confirmRemove: (name: string) =>
      `Remove ${name}? Their tasks in this workspace become unassigned.`,
    remove: (name: string) => `Remove ${name}`,
    addTitle: "Add a member",
    addHint:
      "The person needs an account already. Use the exact email they sign in with.",
    email: "Email",
    role: "Role",
    add: "Add member",
  },
  space: {
    title: (name: string) => `Space: ${name}`,
    name: "Name",
    save: "Save",
    privateLabel: "Private: only admins and the people listed below can see it",
    defaultTitle: "Default workflow",
    defaultHelp:
      "New lists in this space start with this flow, unless their folder has its own default or you pick another one when creating them.",
    workflow: "Workflow",
    genericNone: "Generic: to do, in progress, done, discarded",
    saveDefault: "Save default workflow",
    foldersTitle: "Folders",
    foldersHelp: "Folders are optional: they group lists inside the space.",
    folderName: "Folder name",
    rename: "Rename",
    defaultOf: (name: string) => `Default workflow of ${name}`,
    sameAsSpace: "Same as the space",
    saveWorkflow: "Save workflow",
    deleteNamed: (name: string) => `Delete ${name}`,
    newFolder: "New folder",
    addFolder: "Add folder",
    deleteSpace: "Delete space",
    deleteSpaceHint: "This permanently deletes its folders, lists and tasks.",
    accessTitle: "Who can see it",
    accessHelp:
      "The owner and admins see every space. Members see public spaces and the private ones they are listed in; guests only the spaces they are listed in.",
    accessNone: "There are no members or guests in the workspace yet.",
  },
  templateSelect: { system: "System templates", yours: "Your workspace" },
  listSettings: {
    title: "List settings",
    name: "Name",
    description: "Description (optional)",
    save: "Save",
    alertsTitle: "Alerts",
    alertsHelp:
      "Once a day TaskFlow checks this list and notifies the admins (stage alerts) or the assignees (a task that is too old).",
    wipDays: "Days over a stage's WIP limit before alerting",
    bandDays: "Days a stage must keep growing before alerting",
    dropPercent: "Weekly throughput drop (%) before alerting",
    saveThresholds: "Save alert thresholds",
    deleteList: "Delete list",
    deleteListHint: "This permanently deletes the board and its tasks.",
  },
  listPage: {
    metrics: "Metrics",
    forecast: "Forecast",
    activity: "Activity",
    workflow: "Workflow",
    settings: "List settings",
  },
  flow: {
    title: (list: string) => `Workflow of ${list}`,
    groupSystem: "System",
    groupWorkspace: "Your workspace",
    saveAsTemplate: "Save as template",
    saveTemplateTitle: "Save this flow as a template",
    saveTemplateHelp:
      "Saves the flow as it is stored now (save your changes first). Anyone in the workspace can then start a list from it.",
    templateName: "Template name",
    startTitle: "Start from a template",
    startHelp:
      "Loading a template replaces the stages below. Nothing changes until you save, and the tasks of any replaced stage go where you choose.",
    template: "Template",
    load: "Load template",
    undo: "Undo my changes",
    stagesTitle: "Stages",
    stagesHelpBefore:
      "Work moves from top to bottom. The order of categories is fixed: to do, then active or waiting, then done, then discarded. The ",
    commitmentPoint: "commitment point",
    stagesHelpAfter:
      " is where a task counts as started: the cycle time begins there.",
    name: "Name",
    category: "Category",
    wipLimit: "WIP limit",
    none: "None",
    policy: "Policy: what it takes to enter or leave this stage",
    commitment: "Commitment point",
    stageFallback: "stage",
    up: (name: string) => `Move ${name} up`,
    down: (name: string) => `Move ${name} down`,
    remove: (name: string) => `Remove ${name}`,
    add: "Add a stage",
    whereTitle: "Where do the tasks of removed stages go?",
    tasksMove: (stage: string, n: number) =>
      `${stage}: ${n} task${n === 1 ? "" : "s"} move to`,
    unnamed: "(unnamed stage)",
    whereHint:
      "They are added at the end of the chosen stage, in their current order.",
    saved: "Flow saved.",
    save: "Save flow",
    problems: {
      tooMany: (max: number) => `A flow has at most ${max} stages`,
      nameRequired: "Every stage needs a name",
      duplicate: (name: string) => `Two stages are called "${name}"`,
      limitNotAllowed: (name: string, category: string) =>
        `"${name}" is ${category}: only to do, active and waiting stages can have a WIP limit`,
      missing: (category: string) =>
        `The flow needs at least one ${category} stage`,
      order: (
        name: string,
        category: string,
        previous: string,
        previousCategory: string,
      ) =>
        `"${name}" (${category}) cannot come after "${previous}" (${previousCategory}): the order is to do, active or waiting, done, discarded`,
      commitmentCount: "Choose exactly one commitment point",
      commitmentCategory: "The commitment point must be an active stage",
    },
  },
  activity: {
    title: (list: string) => `Activity of ${list}`,
    none: "Nothing has happened here yet.",
    older: "Older activity",
  },
  events: {
    removedStage: "a removed stage",
    created: (actor: string, stage: string) =>
      `${actor} created it in ${stage}`,
    moved: (actor: string, from: string, to: string) =>
      `${actor} moved it from ${from} to ${to}`,
    discarded: (actor: string, from: string, to: string) =>
      `${actor} discarded it (from ${from} to ${to})`,
    reopened: (actor: string, from: string, to: string) =>
      `${actor} reopened it (from ${from} to ${to})`,
    blocked: (actor: string, stage: string) =>
      `${actor} blocked it in ${stage}`,
    unblocked: (actor: string, stage: string) =>
      `${actor} unblocked it in ${stage}`,
  },
  card: {
    blocked: "blocked",
    due: (date: string) => `Due ${date}`,
    checklist: (done: number, total: number) => `${done}/${total} done`,
    count: (shown: number, total: number) => `${shown} of ${total}`,
    limit: (n: number) => ` · limit ${n}`,
  },
  drag: {
    task: "task",
    column: (name: string) => `column ${name}`,
    pickedUp: (task: string) => `Picked up ${task}.`,
    over: (task: string, target: string) => `${task} is over ${target}.`,
    notOver: (task: string) => `${task} is not over a drop area.`,
    dropped: (task: string, target: string) =>
      `${task} was dropped on ${target}.`,
    droppedNowhere: (task: string) => `${task} was dropped.`,
    cancelled: (task: string) => `Moving ${task} was cancelled.`,
  },
  dialog: {
    conflict:
      "The board changed while this was open. Your changes are still here; check the board and save again.",
    confirmDelete: (title: string) => `Delete “${title}”?`,
    newIn: (column: string) => `New task in ${column}`,
    task: "Task",
    edit: "Edit task",
    title: "Title",
    description: "Description",
    priority: "Priority",
    type: "Type",
    noType: "No type",
    assignees: "Assignees",
    nobodyToAssign: "Nobody can be assigned yet.",
    labels: "Labels",
    noLabels:
      "The workspace has no labels yet. An admin can add them in the workspace settings.",
    due: "Due date",
    blockedLegend: "Blocked",
    blockedCheck: "This task is blocked",
    blockedReason: "Reason (required while blocked)",
    create: "Create task",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    moveLegend: "Move task",
    column: "Column",
    position: "Position",
    filtersOn: "Filters are on: the task goes to the end of the column.",
    moveToEnd: "Move to end",
    move: "Move",
  },
  details: {
    loadError: "Could not load the checklist, comments and history.",
    loading: "Loading...",
    checklist: "Checklist",
    removeItem: (title: string) => `Remove ${title}`,
    noItems: "No checklist items.",
    newItem: "New checklist item",
    addItem: "Add item",
    comments: "Comments",
    deleteComment: (author: string) => `Delete comment by ${author}`,
    noComments: "No comments yet.",
    newComment: "New comment",
    addComment: "Add comment",
    history: "History",
  },
  /** The ready-made flows by key, with the stages in the same order as `SYSTEM_TEMPLATES`: what people read when they pick one. */
  systemTemplates: {
    generic: {
      name: "Generic",
      description: "The basics: to do, in progress, done.",
      stages: [
        { name: "To do", policy: null },
        { name: "In progress", policy: null },
        { name: "Done", policy: null },
        { name: "Discarded", policy: null },
      ],
    },
    software: {
      name: "Software development",
      description: "From backlog to done with review and testing.",
      stages: [
        { name: "Backlog", policy: null },
        { name: "Ready", policy: "Clear description and acceptance criteria." },
        { name: "In progress", policy: null },
        {
          name: "Code review",
          policy: "At least one approval before merging.",
        },
        { name: "Testing", policy: null },
        { name: "Done", policy: "Merged and deployed." },
        { name: "Discarded", policy: null },
      ],
    },
    support: {
      name: "Support desk",
      description: "Requests from first contact to resolution.",
      stages: [
        { name: "New", policy: null },
        { name: "Triage", policy: "Priority and owner assigned." },
        { name: "In progress", policy: null },
        {
          name: "Waiting for customer",
          policy: "We asked the customer something and wait for the answer.",
        },
        { name: "Resolved", policy: null },
        { name: "Discarded", policy: null },
      ],
    },
    hiring: {
      name: "Hiring",
      description: "Candidates from application to hire.",
      stages: [
        { name: "Applied", policy: null },
        { name: "Screening", policy: null },
        { name: "Interview", policy: null },
        { name: "Offer", policy: null },
        { name: "Hired", policy: null },
        { name: "Withdrawn or rejected", policy: null },
      ],
    },
    marketing: {
      name: "Content marketing",
      description: "Ideas to published pieces.",
      stages: [
        { name: "Ideas", policy: null },
        { name: "Planned", policy: null },
        { name: "Writing", policy: null },
        { name: "Review", policy: null },
        { name: "Scheduled", policy: "Approved, waiting for its date." },
        { name: "Published", policy: null },
        { name: "Dropped", policy: null },
      ],
    },
  },
  alerts: {
    wipOverLimit: (stage: string, days: number, count: number, limit: number) =>
      `"${stage}" has been over its WIP limit for ${days} days (${count} of ${limit}). Finish something before pulling more in.`,
    bandWidening: (stage: string, from: number, to: number, days: number) =>
      `"${stage}" has grown from ${from} to ${to} tasks in ${days} days without shrinking: work is arriving faster than it leaves.`,
    taskAging: (title: string, days: string, p85: string) =>
      `"${title}" has been in progress for ${days} days, longer than 85% of finished tasks (${p85} days).`,
    throughputDrop: (
      week: string,
      count: number,
      average: string,
      percent: number,
    ) =>
      `The week of ${week} finished ${count} tasks, against ${average} a week on average before: a drop of ${percent}%.`,
    aTask: "A task",
  },
  queryErrors: {
    badDate: "Use a real date as YYYY-MM-DD",
    future: "The range cannot end in the future",
    endsBefore: "The range cannot end before it starts",
    tooLong: (max: number) => `The range can be at most ${max} days`,
    tasksWhole: "The number of tasks must be a whole number",
    tasksMin: "The number of tasks must be at least 1",
    tasksMax: (max: number) => `The number of tasks can be at most ${max}`,
    seedWhole: "The seed must be a whole number",
    seedMin: "The seed cannot be negative",
    seedMax: (max: number) => `The seed can be at most ${max}`,
    both: "Choose either a number of tasks or a date, not both",
    dateAfter: "The date must be after today",
    dateAhead: (max: number) => `The date can be at most ${max} days ahead`,
  },
  metricHelp: Object.fromEntries(
    Object.entries(METRIC_HELP).map(([key, help]) => [
      key,
      {
        title: help.title,
        what: help.what,
        why: help.why,
        read: help.read,
        sourceLabel: help.source.label,
      },
    ]),
  ) as Record<
    MetricKey,
    {
      title: string;
      what: string;
      why: string;
      read: string;
      sourceLabel: string;
    }
  >,
  metrics: {
    title: (list: string) => `Metrics of ${list}`,
    spaceTitle: (space: string) => `Metrics of the space ${space}`,
    spaceIntro:
      "All the lists of the space together. Their stages differ, so the charts group them by category.",
    rangeLabel: "Range and filters",
    from: "From",
    to: "To",
    type: "Type",
    anyType: "Any type",
    noType: "No type",
    assignee: "Assignee",
    anyone: "Anyone",
    unassigned: "Unassigned",
    apply: "Apply",
    last: "Last (UTC days)",
    days: (n: number) => `${n} days`,
    openForecast: "Open the forecast",
    errorSuffix: "Showing the last 30 days instead.",
    figures: {
      median: "Median cycle time",
      finished: "Finished",
      inProgress: "In progress now",
      older: "Older than 85% of finished",
    },
    expand: "Expand",
    back: "Back to the dashboard",
    showData: "Show the data",
    whatIs: "What is this and how to read it",
    what: "What it is",
    why: "Why it matters",
    read: "How to read it",
    source: "Source",
    tasks: (n: number) => (n === 1 ? "1 task" : `${n} tasks`),
    deletedStage: (name: string) => `Deleted stage (${name})`,
    cfd: {
      svg: "Cumulative flow diagram",
      none: "There is no history in this range yet.",
      summary: (date: string, total: string, parts: string) =>
        `On ${date} there were ${total} in the flow: ${parts}.`,
      part: (count: number, name: string) => `${count} in ${name}`,
      caption: "Tasks per stage at the end of each day",
      day: "Day",
    },
    cycle: {
      none: "No task was finished in this range.",
      summary: (
        finished: string,
        p50: string,
        p85: string,
        p95: string,
        lead50: string,
        lead85: string,
      ) =>
        `${finished} finished. Half took ${p50} or less, 85% took ${p85} or less and 95% took ${p95} or less. Lead time (from creation): ${lead50} the median, ${lead85} at 85%.`,
      caption: "Cycle and lead time of each finished task",
      task: "Task",
      finishedOn: "Finished",
      cycleDays: "Cycle time (days)",
      leadDays: "Lead time (days)",
      svg: "Cycle time of each finished task",
      line: (percent: number, days: string) => `${percent}%: ${days}`,
    },
    aging: {
      none: "Nothing is in progress right now.",
      summary: (total: string, oldest: string) =>
        `${total} in progress; the oldest has been going for ${oldest}.`,
      noneOlder: (p85: string) =>
        ` None is older than the 85th percentile of cycle time (${p85}).`,
      someOlder: (n: number, p85: string) =>
        ` ${n} older than the 85th percentile of cycle time (${p85}).`,
      caption: "Age of each task in progress",
      task: "Task",
      stage: "Stage",
      ageDays: "Age (days)",
      svg: "Age of each task in progress, by stage",
      line: (p85: string) => `85% of finished: ${p85}`,
    },
    throughput: {
      summary: (total: string, from: string, to: string) =>
        `${total} finished between ${from} and ${to}`,
      perWeek: (average: string) => `, ${average} per week on average`,
      caption: "Tasks finished per week",
      week: "Week starting (Monday)",
      finished: "Finished",
      svg: "Tasks finished per week",
      bar: (week: string, n: number) => `Week of ${week}: ${n}`,
    },
    wip: {
      summary: (total: string) => `${total} in progress now.`,
      over: " At least one stage is over its limit.",
      of: (limit: number) => ` of ${limit}`,
      overLimit: " (over the limit)",
    },
    efficiency: {
      none: "No task was finished in this range.",
      summary: (
        percent: number,
        active: string,
        waiting: string,
        blocked: string,
        reopened: number,
      ) =>
        `${percent}% of the in-progress time of finished tasks was active work (${active} days active, ${waiting} waiting, ${blocked} of them blocked). Reopened in this range: ${reopened}.`,
    },
  },
  forecast: {
    title: (list: string) => `Forecast of ${list}`,
    intro:
      "A Monte Carlo simulation over the pace of this list: it replays the days of the history window at random, thousands of times, and says how likely each outcome is.",
    historyFrom: "History from",
    to: "to",
    seed: "Seed",
    workdays: "Only working days (Monday to Friday)",
    whenTitle: "When will it be done?",
    numberOfTasks: "Number of tasks",
    allPending: "All the pending ones",
    forecastDate: "Forecast the date",
    howManyTitle: "How many by a date?",
    dateAfter: "Date (after today)",
    forecastCount: "Forecast the count",
    historyWindow: "History window:",
    errorSuffix: "Showing the default instead.",
    nothingPending:
      "There is nothing pending in this list (no tasks in to do, active or waiting), so there is nothing to forecast. Enter a number of tasks to ask anyway.",
    impossible: (from: string, to: string) =>
      `No task was finished between ${from} and ${to}, so there is no pace to replay. Choose a longer window or finish some work first.`,
    noDays: (date: string) =>
      `There are no days between tomorrow and ${date}, so nothing more can be finished by then.`,
    noWorkdays: (date: string) =>
      `There are no working days between tomorrow and ${date}, so nothing more can be finished by then.`,
    howMany: (
      date: string,
      days: number,
      unit: string,
      p95: string,
      p85: string,
      p50: string,
    ) =>
      `By ${date} (${days} ${unit} from tomorrow) the team finishes at least ${p95} with 95% probability, ${p85} with 85%, and ${p50} with 50%.`,
    notWithin: (percent: number, horizon: number, unit: string) =>
      `${percent}% probability: not within ${horizon} ${unit}`,
    within: (percent: number, days: number, unit: string, date: string) =>
      `${percent}% probability: within ${days} ${unit} (by ${date})`,
    whenSummary: (items: string, all: boolean, parts: string) =>
      `Finishing ${items}${all ? " (all the pending ones)" : ""} takes, counting from tomorrow: ${parts}.`,
    unit: (n: number, workdays: boolean): string =>
      workdays
        ? n === 1
          ? "working day"
          : "working days"
        : n === 1
          ? "day"
          : "days",
    whatDays: "Days until done",
    whatWorkdays: "Working days until done",
    whatTasks: "Tasks finished",
    caption: (what: string, runs: string) =>
      `${what} in ${runs} simulated futures`,
    simulated: "Simulated futures",
    share: "Share",
    settings: (
      from: string,
      to: string,
      days: number,
      withData: number,
      finished: number,
      seed: number,
      workdaysOnly: boolean,
      runs: string,
    ) =>
      `History ${from} to ${to} (${days} days, ${withData} with finished tasks, ${finished} finished). Seed ${seed}. ${workdaysOnly ? "Working days only." : "All calendar days."} ${runs} simulated futures; the same history and seed always give the same answer.`,
    barNote:
      "Each bar is the share of simulated futures (%) that ended with that result; the dashed lines mark 50%, 85% and 95%.",
    svg: (what: string) => `How the simulated futures spread: ${what}`,
    barTitle: (label: string, percent: string) =>
      `${label}: ${percent}% of futures`,
    warnings: {
      fewDays: (have: number, need: number) =>
        `Only ${have} days in this window had finished tasks (fewer than ${need}): treat the forecast as a rough guide.`,
      fewTasks: (have: number, need: number) =>
        `Only ${have} tasks were finished in this window (fewer than ${need}): there is little pace to learn from.`,
    },
  },
  /** What a new workspace starts with. */
  defaults: { types: ["Task", "Bug", "Feature", "Request"] },
  /** The sample workspace of the demo: its names, and the words its tasks are made of. */
  sample: {
    workspace: "Acme Product Team",
    spaces: { Software: "Software", Support: "Support" },
    lists: { Platform: "Platform", "Customer requests": "Customer requests" },
    labels: ["frontend", "backend", "customer", "urgent"],
    verbs: [
      "Fix",
      "Add",
      "Refactor",
      "Improve",
      "Document",
      "Migrate",
      "Optimise",
      "Test",
      "Remove",
      "Review",
    ],
    areas: [
      "login redirect",
      "search filters",
      "payment webhook",
      "invoice export",
      "avatar upload",
      "rate limiter",
      "notification settings",
      "dashboard widgets",
      "CSV import",
      "audit log",
      "password reset",
      "session timeout",
      "onboarding checklist",
      "API pagination",
      "email templates",
      "dark theme colours",
      "cache invalidation",
      "report scheduler",
    ],
    issues: [
      "Cannot log in",
      "Invoice shows the wrong total",
      "Export fails with a timeout",
      "Request: bulk edit",
      "Question about permissions",
      "Email notifications are late",
      "Cannot reset the password",
      "Data missing after import",
      "Question about webhooks",
      "Billing address change",
      "Dashboard is slow",
      "Account deletion request",
    ],
    companies: [
      "Acme",
      "Globex",
      "Initech",
      "Umbrella",
      "Hooli",
      "Stark",
      "Wayne",
    ],
    blocks: [
      "Waiting for API credentials from the vendor",
      "Needs a decision from product",
      "The test environment is down",
      "Waiting for the design review",
    ],
  },
};

export type Catalog = typeof en;
