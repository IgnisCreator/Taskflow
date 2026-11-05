import { MAX_AHEAD_DAYS, MAX_ITEMS, MAX_SEED } from "@/lib/forecast";
import { en, type Catalog } from "@/lib/i18n/en";
import { MAX_RANGE_DAYS } from "@/lib/validations/metrics";

/**
 * The page-level message of a bad metrics or forecast query in the language of `t`. The validators
 * keep the English sentence (the API answers with it); a message with no translation (one that comes
 * from the validation library itself) is shown as it is.
 */
export function translateQueryError(message: string, t: Catalog): string {
  const e = en.queryErrors;
  const x = t.queryErrors;
  const table: [string, string][] = [
    [e.badDate, x.badDate],
    [e.future, x.future],
    [e.endsBefore, x.endsBefore],
    [e.tooLong(MAX_RANGE_DAYS), x.tooLong(MAX_RANGE_DAYS)],
    [e.tasksWhole, x.tasksWhole],
    [e.tasksMin, x.tasksMin],
    [e.tasksMax(MAX_ITEMS), x.tasksMax(MAX_ITEMS)],
    [e.seedWhole, x.seedWhole],
    [e.seedMin, x.seedMin],
    [e.seedMax(MAX_SEED), x.seedMax(MAX_SEED)],
    [e.both, x.both],
    [e.dateAfter, x.dateAfter],
    [e.dateAhead(MAX_AHEAD_DAYS), x.dateAhead(MAX_AHEAD_DAYS)],
  ];
  return table.find(([english]) => english === message)?.[1] ?? message;
}
