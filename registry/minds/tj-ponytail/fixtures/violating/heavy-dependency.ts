import lodash from "lodash";

export function heavyHandler(value: string): string {
  return lodash.trim(value);
}
