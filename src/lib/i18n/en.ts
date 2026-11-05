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
};

export type Catalog = typeof en;
