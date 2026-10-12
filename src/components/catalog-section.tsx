import { ApiForm } from "@/components/api-form";
import type { Catalog } from "@/lib/validations/details";

/**
 * Manage one of the two lists a workspace keeps (task types, labels): rename, delete, add.
 * Deleting a type leaves its tasks without a type; deleting a label takes it off its tasks.
 */
export function CatalogSection({
  workspaceId,
  kind,
  title,
  help,
  items,
}: {
  workspaceId: string;
  kind: Catalog;
  title: string;
  help: string;
  items: { id: string; name: string }[];
}) {
  const one = kind === "types" ? "task type" : "label";
  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted">{help}</p>
      {items.length === 0 && (
        <p className="text-sm text-muted">Nothing here yet.</p>
      )}
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-end gap-2 border-t border-line pt-3"
          >
            <ApiForm
              method="PATCH"
              url={`/api/catalog/${kind}/${item.id}`}
              submit="Rename"
              className="flex flex-1 flex-wrap items-end gap-2"
            >
              <label className="field flex-1">
                Name of the {one}
                <input
                  name="name"
                  required
                  maxLength={40}
                  defaultValue={item.name}
                  className="input"
                />
              </label>
            </ApiForm>
            <ApiForm
              method="DELETE"
              url={`/api/catalog/${kind}/${item.id}`}
              submit={`Delete ${item.name}`}
              danger
              className="flex items-end gap-2"
            />
          </li>
        ))}
      </ul>
      <ApiForm
        method="POST"
        url={`/api/workspaces/${workspaceId}/catalog/${kind}`}
        submit={`Add ${one}`}
        className="space-y-2 border-t border-line pt-3"
      >
        <label className="field">
          New {one}
          <input name="name" required maxLength={40} className="input" />
        </label>
      </ApiForm>
    </section>
  );
}
