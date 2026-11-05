// Español neutro, de tú. Mismo tipo que `en.ts`: si falta una clave, no compila.

import type { Catalog } from "./en";

export const es: Catalog = {
  language: { label: "Idioma", en: "English", es: "Español" },
  nav: {
    skip: "Saltar al contenido",
    main: "Principal",
    workspaces: "Espacios de trabajo",
    notifications: "Notificaciones",
    profile: "Perfil",
    signIn: "Iniciar sesión",
    unread: (n) => `${n} sin leer`,
  },
  theme: {
    auto: "Auto",
    light: "Claro",
    dark: "Oscuro",
    button: (mode) => `Tema: ${mode}`,
    switchTo: (current, next) => `Tema: ${current}. Cambiar a ${next}`,
  },
  meta: { description: "Gestor de proyectos Kanban colaborativo" },
  roles: {
    OWNER: "Propietario",
    ADMIN: "Admin",
    MEMBER: "Miembro",
    GUEST: "Invitado",
  },
  demo: {
    explore: "Explorar la demo",
    caption:
      "La demo abre tu propio espacio de pruebas con datos inventados. Puedes cambiar lo que quieras; se borra a las 24 horas.",
    limit:
      "Demasiados intentos de abrir la demo desde esta dirección. Inténtalo más tarde.",
    busy: "La demo está llena en este momento. Inténtalo de nuevo en un rato.",
    banner: (until) =>
      `Este es tu propio espacio de demostración, con datos inventados. Se borra el ${until} UTC, 24 horas después de abrirlo.`,
    restart: "Reiniciar la demo",
    leave: "Salir y borrarla",
  },
  landing: {
    badge: "Kanban para equipos pequeños",
    title: "Mira en qué trabaja tu equipo, de un vistazo",
    intro:
      "TaskFlow es una herramienta Kanban para equipos. Organiza tu trabajo en espacios y listas, añade tareas y muévelas juntos desde la idea hasta terminarlas.",
    goToWorkspaces: "Ir a tus espacios de trabajo",
    signIn: "Iniciar sesión",
    signInGithub: "Iniciar sesión con GitHub",
    whatIsKanban: "¿Qué es Kanban?",
    kanbanText:
      "Kanban (“cartel” en japonés) es una forma de gestionar el trabajo con un tablero. Nació en las fábricas de Toyota en los años 40 y 50, donde unas tarjetas indicaban a cada estación qué fabricar a continuación, y más tarde la adoptaron los equipos de software. El tablero tiene columnas para las etapas de tu trabajo; cada tarea es una tarjeta que pasa por ellas.",
    exampleLabel:
      "Tablero de ejemplo: Por hacer tiene dos tarjetas, En curso tiene una y Hecho tiene dos.",
    exampleColumns: [
      {
        name: "Por hacer",
        cards: ["Escribir el informe", "Reservar el local"],
      },
      { name: "En curso", cards: ["Diseñar el cartel"] },
      { name: "Hecho", cards: ["Elegir una fecha", "Invitar al equipo"] },
    ],
    step: (n) => `Paso ${n}`,
    principles: [
      {
        title: "Haz visible el trabajo",
        text: "Cada tarea es una tarjeta en un tablero, así que nada se queda escondido en la cabeza o en la bandeja de entrada de alguien.",
      },
      {
        title: "Limita lo que está en curso",
        text: "Empezar menos cosas a la vez significa terminar más. Los equipos Kanban ponen un tope a cada columna.",
      },
      {
        title: "Vigila el flujo",
        text: "Las tarjetas avanzan de izquierda a derecha. Donde se acumulan es donde el proceso está atascado.",
      },
    ],
    note: "TaskFlow te da el tablero, las tarjetas y el flujo. Todavía no impone límites por columna; eso depende del equipo.",
    doesTitle: "Qué hace TaskFlow",
    features: [
      {
        title: "Tableros compartidos",
        text: "Reúne hasta 20 personas en un espacio de trabajo, con espacios, carpetas y listas. Todos ven los mismos tableros y los cambios aparecen en segundos.",
      },
      {
        title: "Roles con sentido",
        text: "Los admins gestionan el equipo, los miembros mueven y editan tareas, los lectores solo leen. Lo impone el servidor, no solo los botones.",
      },
      {
        title: "Arrastra o usa el teclado",
        text: "Arrastra tarjetas entre columnas, o elige columna y posición desde el diálogo de la tarea. Ambas formas funcionan con teclado.",
      },
      {
        title: "Encuentra todo rápido",
        text: "Busca por título o descripción y filtra por responsable o prioridad. Los filtros viven en la URL, así que puedes compartirlos.",
      },
      {
        title: "Sin ediciones perdidas",
        text: "Si dos personas cambian el tablero a la vez, nadie se sobrescribe en silencio: se te avisa y tu texto se conserva.",
      },
      {
        title: "Claro y oscuro",
        text: "Sigue el tema de tu sistema, o elige uno desde la cabecera.",
      },
    ],
    readyTitle: "¿Listo para probarlo?",
    readyText:
      "Inicia sesión, crea un espacio de trabajo y cada lista nueva empieza con cuatro columnas.",
  },
  login: {
    title: "Iniciar sesión",
    orEmail: "o usa tu correo",
    name: "Nombre",
    email: "Correo",
    password: "Contraseña",
    atLeast10: "Al menos 10 caracteres.",
    digestOptIn: "Envíame un resumen diario de las alertas de mis listas",
    create: "Crear cuenta",
    signInEmail: "Iniciar sesión con correo",
    haveAccount: "Ya tengo una cuenta",
    createWithEmail: "Crear una cuenta con correo",
    sent: (email) =>
      `Revisa tu bandeja de entrada: enviamos un enlace de confirmación a ${email}. Ábrelo para terminar; después podrás iniciar sesión.`,
    signOut: "Cerrar sesión",
    failed: "Algo salió mal. Inténtalo de nuevo.",
    authErrors: {
      INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos",
      USER_ALREADY_EXISTS: "Ese usuario ya existe. Usa otro correo.",
      PASSWORD_TOO_SHORT: "La contraseña es demasiado corta",
      PASSWORD_TOO_LONG: "La contraseña es demasiado larga",
      INVALID_PASSWORD: "Contraseña no válida",
      EMAIL_NOT_VERIFIED: "Correo sin verificar",
      INVALID_EMAIL: "Correo no válido",
    },
  },
  profile: {
    title: "Perfil",
    joinHint:
      "Para unirte a un espacio de trabajo, dale a su admin el correo con el que inicias sesión.",
    save: "Guardar",
    dailyEmail: "Correo diario",
    dailyEmailLabel:
      "Envíame las alertas abiertas una vez al día (siempre están en Notificaciones)",
    changePassword: "Cambiar la contraseña",
    currentPassword: "Contraseña actual",
    newPassword: "Contraseña nueva",
    repeatPassword: "Repite la contraseña nueva",
    passwordHint: "Al menos 10 caracteres. Se cerrarán tus otras sesiones.",
    mismatch: "Las contraseñas nuevas no coinciden.",
    changeFailed: "No se pudo cambiar la contraseña.",
    changed: "Contraseña cambiada.",
  },
  notifications: {
    title: "Notificaciones",
    markAll: "Marcar todo como leído",
    markOne: "Marcar como leída",
    read: "Leída",
    intro:
      "Una vez al día TaskFlow revisa cada lista en busca de señales tempranas de un cuello de botella. Una alerta se queda aquí mientras el problema persiste y pasa a Resueltas cuando termina.",
    none: "No hay alertas abiertas. El flujo se ve sano.",
    seeMetrics: (list) => `${list}: ver las métricas`,
    resolved: "Resueltas",
  },
  workspaces: {
    title: "Espacios de trabajo",
    none: "Todavía no estás en ningún espacio de trabajo. Crea uno abajo, o pide a un admin que te añada con el correo con el que inicias sesión.",
    newTitle: "Nuevo espacio de trabajo",
    newHint: "Serás su propietario. Empieza con un espacio público, General.",
    name: "Nombre",
    create: "Crear espacio de trabajo",
  },
  errors: {
    conflict:
      "El tablero cambió mientras tanto. Se recargó la página; inténtalo de nuevo.",
    network:
      "No se pudo contactar con el servidor. Revisa tu conexión y vuelve a intentarlo.",
    generic: "Algo salió mal",
    codes: {
      UNAUTHENTICATED: "Necesitas iniciar sesión",
      FORBIDDEN: "No tienes permiso",
      NOT_FOUND: "No encontrado",
      CSRF_ORIGIN: "Origen no permitido",
      RATE_LIMITED: "Demasiadas peticiones. Inténtalo de nuevo en un momento.",
      DEMO_RESTRICTED: "Esto no está disponible en la demo",
      INVALID_JSON: "El cuerpo debe ser JSON válido",
      INTERNAL: "Error inesperado",
    },
    pageTitle: "Algo salió mal",
    pageBody: "No se pudo cargar la página. Tus datos no cambiaron.",
    retry: "Inténtalo de nuevo",
    notFoundTitle: "No encontrado",
    notFoundBody: "Esta página no existe, o no tienes acceso a ella.",
    backToWorkspaces: "Volver a los espacios de trabajo",
  },
  confirm: { typeBefore: "Escribe ", typeAfter: " para confirmar" },
  board: {
    updatedByOthers: "Otra persona actualizó el tablero.",
    noTasks: "Sin tareas",
    noMatches: "Ninguna tarea coincide con estos filtros.",
    addTask: "Añadir tarea",
    overLimit: (count, limit) =>
      `Por encima del límite de WIP (${count} de ${limit}). Empezar demasiado trabajo a la vez lo frena todo: termina algo antes de traer más.`,
  },
  views: {
    board: "Tablero",
    list: "Lista",
    label: "Vista",
  },
  filters: {
    label: "Filtrar tareas",
    search: "Buscar",
    searchHint: "Título o descripción",
    assignee: "Responsable",
    anyone: "Cualquiera",
    unassigned: "Sin asignar",
    priority: "Prioridad",
    anyPriority: "Cualquiera",
    type: "Tipo",
    anyType: "Cualquier tipo",
    noType: "Sin tipo",
    labelField: "Etiqueta",
    anyLabel: "Cualquier etiqueta",
    blocked: "Bloqueo",
    anyBlocked: "Bloqueadas o no",
    onlyBlocked: "Solo bloqueadas",
    notBlocked: "No bloqueadas",
    apply: "Aplicar",
    clear: "Limpiar",
  },
  table: {
    caption: "Tareas de esta lista",
    title: "Título",
    stage: "Etapa",
    priority: "Prioridad",
    type: "Tipo",
    assignees: "Responsables",
    labels: "Etiquetas",
    due: "Vence",
    status: "Estado",
    newTask: "Nueva tarea",
    empty: "Todavía no hay tareas.",
    sortedBy: (column, dir) =>
      `Ordenado por ${column}, ${dir === "asc" ? "ascendente" : "descendente"}`,
  },
};
