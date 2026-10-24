// V3 artboards: pick the theme from ?theme=<name> (the canvas passes it), default Just black,
// the app's default. Themes and colours come from docs/design/tokens.css, unchanged.
(function () {
  const t = new URLSearchParams(location.search).get('theme') || 'just-black';
  document.documentElement.setAttribute('data-theme', t);
})();
