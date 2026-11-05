import { catalogs, type Lang } from "@/lib/i18n";
import type { FlowStage } from "@/lib/workflow";

type Template = { name: string; description: string; stages: FlowStage[] };

/**
 * A system template with the names and policies of `lang`. The categories, limits and the commitment
 * point (what the metrics depend on) never change. Without a translation of the same shape the template
 * is returned as it is.
 */
export function localizeTemplate(
  key: string,
  template: Template,
  lang: Lang,
): Template {
  const text = (
    catalogs[lang].systemTemplates as Record<
      string,
      | {
          name: string;
          description: string;
          stages: { name: string; policy: string | null }[];
        }
      | undefined
    >
  )[key];
  if (!text || text.stages.length !== template.stages.length) return template;
  return {
    name: text.name,
    description: text.description,
    stages: template.stages.map((stage, i) => ({
      ...stage,
      name: text.stages[i]!.name,
      policy: text.stages[i]!.policy,
    })),
  };
}
