export const LOCALES = ["id"];
export const DEFAULT_LOCALE = "id";
export const LOCALE_COOKIE = "locale";
export const LOCALE_NAMES = { id: "Indonesia" };

export function normalizeLocale() {
  return DEFAULT_LOCALE;
}

export function isSupportedLocale(locale) {
  return locale === DEFAULT_LOCALE;
}
