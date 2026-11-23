// Keep Domino/Zone's SSR globals isolated from the browser test's native CDP client.
const path = require('node:path');
process.chdir(path.resolve(__dirname, '..'));
require('./local-cms-transport.cjs').installLocalCmsTransport();
const server = require(path.resolve('dist/upforex_Frontend/server/main.js')).app().listen(0, '127.0.0.1');
server.once('listening', () => process.send({port:server.address().port}));
process.on('message', message => {
  if (message === 'stop') {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  }
});
