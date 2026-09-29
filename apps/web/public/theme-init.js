// Run before styles render so a saved dark preference does not flash light.
(() => {
  let preference = null;
  try { preference = localStorage.getItem('caltrack.theme'); } catch { /* Private browsing. */ }
  const theme = preference === 'light' || preference === 'dark'
    ? preference : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
