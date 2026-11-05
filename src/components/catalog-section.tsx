import { ApiForm } from "@/components/api-form";
import type { Catalog } from "@/lib/validations/details";
import { getT } from "@/server/i18n";

/**
 * Manage one of the two lists a workspace keeps (task types, labels): rename, delete, add.
 * Deleting a type leaves its tasks without a type; deleting a label takes it off its tasks.
 */
export async function CatalogSection({
  workspaceId,
  kind,
  items,
}: {
  workspaceId: string;
  kind: Catalog;
  items: { id: string; name: string }[];
}) {
  const { t } = await getT();
  const text = t.catalog[kind];
  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-semibold">{text.title}</h2>
      <p className="text-sm text-muted">{text.help}</p>
      {items.length === 0 && (
        <p className="text-sm text-muted">{t.catalog.nothing}</p>
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
              submit={t.catalog.rename}
              className="flex flex-1 flex-wrap items-end gap-2"
            >
              <label className="field flex-1">
                {text.nameOf}
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
              submit={t.settings.deleteNamed(item.name)}
              danger
              className="flex items-end gap-2"
            />
          </li>
        ))}
      </ul>
      <ApiForm
        method="POST"
        url={`/api/workspaces/${workspaceId}/catalog/${kind}`}
        submit={text.add}
        className="space-y-2 border-t border-line pt-3"
      >
        <label className="field">
          {text.newOne}
          <input name="name" required maxLength={40} className="input" />
        </label>
      </ApiForm>
    </section>
  );
}
