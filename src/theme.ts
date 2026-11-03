const theme = document.querySelector<HTMLSelectElement>('#theme')!;
const storageKey = '3dbilliard-theme';

function applyTheme(value: string) {
  theme.value = Array.from(theme.options).some(option => option.value === value) ? value : 'club';
  document.documentElement.dataset.theme = theme.value;
}

try {
  applyTheme(localStorage.getItem(storageKey) ?? 'club');
} catch {
  applyTheme('club');
}

theme.addEventListener('change', () => {
  applyTheme(theme.value);
  try {
    localStorage.setItem(storageKey, theme.value);
  } catch {
    // Theme changes still apply when browser storage is unavailable.
  }
});

export {};
