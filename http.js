export const assetFiles = new Map([
  ['/', 'index.html'], ['/auth/openrouter/callback', 'index.html'], ['/request', 'request.html'], ['/help', 'help.html'], ['/about', 'about.html'],
  ...['app.js', 'training.js', 'protocol.js', 'examples.js', 'example-results.json', 'auth.js', 'compare.js', 'builder.js', 'builder-data.js', 'card.js', 'dom.js', 'style.css', 'horse.svg', 'horse.LICENSE.txt', 'unfurl.png'].map(file => [`/${file}`, file]),
]);

export const apiPaths = new Set(['/api/v1/systemone', '/v1/systemone']);

export const assetHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://openrouter.ai; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
};
