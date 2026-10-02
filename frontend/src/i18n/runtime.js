import { DEFAULT_LOCALE } from "./config";

let currentLocale = DEFAULT_LOCALE;
const reloadCallbacks = [];

export function translate(text) {
  return text;
}

export function getCurrentLocale() {
  return "id";
}

export function onLocaleChange(callback) {
  reloadCallbacks.push(callback);
  return () => {
    const index = reloadCallbacks.indexOf(callback);
    if (index >= 0) reloadCallbacks.splice(index, 1);
  };
}

export async function initRuntimeI18n() {
  if (typeof document !== "undefined") {
    document.documentElement.lang = "id";
    document.documentElement.setAttribute("translate", "no");
  }
  currentLocale = "id";
}

export async function reloadTranslations() {
  currentLocale = "id";
  reloadCallbacks.forEach((callback) => callback());
}
