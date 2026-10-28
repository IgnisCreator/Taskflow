import { handle, json, requireUser } from "@/server/http";
import { listNotifications } from "@/server/services/notifications";

export const GET = handle(async () =>
  json(await listNotifications((await requireUser()).id)),
);
