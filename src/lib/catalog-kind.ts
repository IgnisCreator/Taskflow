import { CATALOGS, type Catalog } from "@/lib/validations/details";

/** The kind in a URL, or null when it is not one of the two lists a workspace keeps. */
export const parseKind = (value: string): Catalog | null =>
  (CATALOGS as readonly string[]).includes(value) ? (value as Catalog) : null;
