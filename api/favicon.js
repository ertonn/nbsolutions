// Simple redirect for /favicon.ico -> /assets/favicon_io/favicon.ico
module.exports = (req, res) => {
  res.writeHead(302, { Location: '/assets/favicon_io/favicon.ico' });
  res.end();
};