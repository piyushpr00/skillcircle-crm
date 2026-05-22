const app = require('../server/app');

module.exports = async (req, res) => {
  await app.dbInit();
  return app(req, res);
};
