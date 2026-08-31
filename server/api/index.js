// Vercel serverless entry. The platform imports this per request and calls the
// exported handler; the Express app doubles as one. Nothing may bind a port
// here — see server/app.js.
import app from "../app.js";

export default app;
