import type { listTemplates } from "@/server/services/templates";

type Templates = Awaited<ReturnType<typeof listTemplates>>;

/**
 * A native select of flow templates (system ones, then the workspace own). The empty option is
 * what `none` says; the form turns it into null.
 */
export function TemplateSelect({
  name,
  label,
  none,
  templates,
  value,
}: {
  name: string;
  label: string;
  none: string;
  templates: Templates;
  value?: string | null;
}) {
  return (
    <label className="field">
      {label}
      <select name={name} defaultValue={value ?? ""} className="input">
        <option value="">{none}</option>
        <optgroup label="System templates">
          {templates.system.map((t) => (
            <option key={t.ref} value={t.ref}>
              {t.name}
            </option>
          ))}
        </optgroup>
        {templates.organisation.length > 0 && (
          <optgroup label="Your workspace">
            {templates.organisation.map((t) => (
              <option key={t.ref} value={t.ref}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}
