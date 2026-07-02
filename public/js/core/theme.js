const THEMES = ["warm", "dark", "light"];

function getSystemPreference() {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

export function initTheme() {
  const saved = localStorage.getItem("theme");
  applyTheme(saved && THEMES.includes(saved) ? saved : getSystemPreference());
}

export function cycleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  applyTheme(next);
}

window.cycleTheme = cycleTheme;
