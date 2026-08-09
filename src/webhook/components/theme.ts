// Theme choice is the only non-webhook-id value the browser stores.
export const THEME_STORAGE_KEY = "website-hook:theme";

/**
 * Runs in <head> before the body paints, so the first frame is already the right theme.
 * OS preference decides until the user picks explicitly; after that the stored choice wins.
 */
export const THEME_INIT_SCRIPT = `try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=s?s==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}`;
