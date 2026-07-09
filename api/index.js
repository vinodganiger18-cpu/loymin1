// Vercel serverless entrypoint. Vercel routes /api/* and /auth/* here (see
// vercel.json) and invokes the exported Express app as a request handler.
// The app never calls app.listen() in this context (guarded by require.main).
module.exports = require('../perkpay-backend/src/app');
