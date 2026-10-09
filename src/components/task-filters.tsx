import Link from "next/link";
import {
  UNASSIGNED,
  isFiltered,
  type TaskFilter,
} from "@/lib/validations/filters";
import type { MemberView } from "@/components/task-dialog";

/**
 * A plain GET form: the filters live in the URL (shareable, survive a reload) and it works with the
 * keyboard and without client code. Submitting re-runs the page, and the filtering happens in SQL.
 */
export function TaskFilters({
  filter,
  members,
}: {
  filter: TaskFilter;
  members: MemberView[];
}) {
  return (
    <form
      role="search"
      aria-label="Filter tasks"
      className="flex flex-wrap items-end gap-3"
    >
      <label className="field min-w-48 flex-1">
        Search
        <input
          type="search"
          name="q"
          maxLength={100}
          defaultValue={filter.q}
          placeholder="Title or description"
          className="input"
        />
      </label>
      <label className="field">
        Assignee
        <select
          name="assignee"
          defaultValue={filter.assignee ?? ""}
          className="input"
        >
          <option value="">Anyone</option>
          <option value={UNASSIGNED}>Unassigned</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Priority
        <select
          name="priority"
          defaultValue={filter.priority ?? ""}
          className="input"
        >
          <option value="">Any</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </label>
      <button type="submit" className="btn">
        Apply
      </button>
      {isFiltered(filter) && (
        <Link href="?" className="btn-secondary">
          Clear
        </Link>
      )}
    </form>
  );
}
