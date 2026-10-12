import Link from "next/link";
import type { CatalogView, MemberView } from "@/components/task-dialog";
import type { Dir, Sort, View } from "@/lib/list-view";
import { messages } from "@/lib/messages";
import {
  UNASSIGNED,
  isFiltered,
  type TaskFilter,
} from "@/lib/validations/filters";

const m = messages.filters;

/**
 * A plain GET form: the filters live in the URL (shareable, survive a reload) and it works with the
 * keyboard and without client code. Submitting re-runs the page, and the filtering happens in SQL.
 * The view and the sort are carried in hidden fields so that filtering does not change them.
 */
export function TaskFilters({
  filter,
  members,
  catalog,
  view,
  sort,
  dir,
}: {
  filter: TaskFilter;
  members: MemberView[];
  catalog: CatalogView;
  view: View;
  sort: Sort;
  dir: Dir;
}) {
  // What "Clear" goes back to: no filters, same view and sort.
  const keep = new URLSearchParams({ view, sort, dir }).toString();
  return (
    <form
      role="search"
      aria-label={m.label}
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="sort" value={sort} />
      <input type="hidden" name="dir" value={dir} />
      <label className="field min-w-48 flex-1">
        {m.search}
        <input
          type="search"
          name="q"
          maxLength={100}
          defaultValue={filter.q}
          placeholder={m.searchHint}
          className="input"
        />
      </label>
      <label className="field">
        {m.assignee}
        <select
          name="assignee"
          defaultValue={filter.assignee ?? ""}
          className="input"
        >
          <option value="">{m.anyone}</option>
          <option value={UNASSIGNED}>{m.unassigned}</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {m.priority}
        <select
          name="priority"
          defaultValue={filter.priority ?? ""}
          className="input"
        >
          <option value="">{m.anyPriority}</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </label>
      <label className="field">
        {m.type}
        <select name="type" defaultValue={filter.type ?? ""} className="input">
          <option value="">{m.anyType}</option>
          <option value={UNASSIGNED}>{m.noType}</option>
          {catalog.types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      {catalog.labels.length > 0 && (
        <label className="field">
          {m.labelField}
          <select
            name="label"
            defaultValue={filter.label ?? ""}
            className="input"
          >
            <option value="">{m.anyLabel}</option>
            {catalog.labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        {m.blocked}
        <select
          name="blocked"
          defaultValue={filter.blocked ?? ""}
          className="input"
        >
          <option value="">{m.anyBlocked}</option>
          <option value="yes">{m.onlyBlocked}</option>
          <option value="no">{m.notBlocked}</option>
        </select>
      </label>
      <button type="submit" className="btn">
        {m.apply}
      </button>
      {isFiltered(filter) && (
        <Link href={`?${keep}`} className="btn-secondary">
          {m.clear}
        </Link>
      )}
    </form>
  );
}
