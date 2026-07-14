/**
 * Tiny classnames helper. Filters falsy values and joins with a space.
 * Kept dependency-free to avoid pulling in clsx/tailwind-merge for Phase 1.
 */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
