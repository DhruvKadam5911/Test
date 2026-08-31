// Local development entry point. Vercel does not use this file — it invokes
// api/index.js per request instead, so nothing here may be required for the
// app to work.
import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Onion VOD server running on http://localhost:${PORT}`);
});
