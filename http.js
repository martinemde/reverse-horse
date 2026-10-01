export const assetFiles = new Map([
  ['/', 'index.html'], ['/auth/openrouter/callback', 'index.html'], ['/request', 'request.html'],
  ...['app.js', 'protocol.js', 'examples.js', 'auth.js', 'compare.js', 'builder.js', 'builder-data.js', 'style.css'].map(file => [`/${file}`, file]),
]);

export const assetHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://openrouter.ai; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
};
