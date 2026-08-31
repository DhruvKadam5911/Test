const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log(`🧪 Starting API Tests against ${BASE_URL}...\n`);

  try {
    // 1. Test Root Endpoint
    console.log("Testing GET / ...");
    const rootRes = await fetch(`${BASE_URL}/`);
    if (!rootRes.ok) throw new Error(`Root endpoint failed with status: ${rootRes.status}`);
    const rootData = await rootRes.json();
    console.log("✅ Root endpoint returns valid JSON:", rootData.name);

    // 2. Test Health Check
    console.log("\nTesting GET /health ...");
    const healthRes = await fetch(`${BASE_URL}/health`);
    if (!healthRes.ok) throw new Error(`Health check failed with status: ${healthRes.status}`);
    const healthData = await healthRes.json();
    console.log(`✅ Health check status: ${healthData.status} - ${healthData.message}`);

    // 3. Test GET /titles
    console.log("\nTesting GET /titles ...");
    const titlesRes = await fetch(`${BASE_URL}/titles`);
    if (!titlesRes.ok) throw new Error(`Fetch titles failed with status: ${titlesRes.status}`);
    const titles = await titlesRes.json();
    console.log(`✅ Successfully fetched ${titles.length} titles.`);

    if (titles.length === 0) {
      console.log("⚠️ Warning: No titles found in database. Make sure you seeded your database!");
      return;
    }

    // Examine first title
    const firstTitle = titles[0];
    console.log(`👉 First Title found: "${firstTitle.title}" (${firstTitle.contentType}) - ID: ${firstTitle.id}`);

    // 4. Test GET /titles/:id
    console.log(`\nTesting GET /titles/${firstTitle.id} ...`);
    const detailRes = await fetch(`${BASE_URL}/titles/${firstTitle.id}`);
    if (!detailRes.ok) throw new Error(`Fetch title details failed with status: ${detailRes.status}`);
    const details = await detailRes.json();
    console.log(`✅ Successfully fetched details for: "${details.title}"`);
    if (details.seasons) {
      console.log(`   Seasons count: ${details.seasons.length}`);
    }

    // 5. Test GET /titles/:id/playback
    console.log(`\nTesting GET /titles/${firstTitle.id}/playback ...`);
    let url = `${BASE_URL}/titles/${firstTitle.id}/playback`;
    if (firstTitle.contentType === "series" && details.seasons?.[0]?.episodes?.[0]) {
      const epId = details.seasons[0].episodes[0].id;
      url += `?episodeId=${epId}`;
      console.log(`   (Series detected, requesting with episodeId: ${epId})`);
    }

    const playbackRes = await fetch(url);
    if (!playbackRes.ok) throw new Error(`Fetch playback URL failed with status: ${playbackRes.status}`);
    const playback = await playbackRes.json();
    // A 200 is not enough: bulk-imported titles carry no stream, and the
    // endpoint happily returns { playbackUrl: null } for them. Reporting that
    // as a pass hides exactly the case a viewer would call broken.
    if (playback.playbackUrl) {
      console.log(`✅ Successfully resolved playback stream URL:`, playback.playbackUrl);
    } else {
      console.log(`⚠️  "${firstTitle.title}" has no stream — it will not play.`);
    }

    // 6. Search and the genre list, both of which the home page depends on.
    console.log("\nTesting GET /titles/search ...");
    const term = firstTitle.title.split(" ")[0];
    const searchRes = await fetch(`${BASE_URL}/titles/search?q=${encodeURIComponent(term)}`);
    if (!searchRes.ok) throw new Error(`Search failed with status: ${searchRes.status}`);
    const found = await searchRes.json();
    if (!found.some((t) => t.id === firstTitle.id)) {
      throw new Error(`Search for "${term}" did not return "${firstTitle.title}"`);
    }
    console.log(`✅ Search for "${term}" returned ${found.length} result(s), including the expected title.`);

    console.log("\nTesting GET /titles/genres ...");
    const genresRes = await fetch(`${BASE_URL}/titles/genres`);
    if (!genresRes.ok) throw new Error(`Genres failed with status: ${genresRes.status}`);
    const genreList = await genresRes.json();
    if (!Array.isArray(genreList) || genreList.length === 0 || !genreList[0].genre) {
      throw new Error("Genres endpoint returned nothing usable.");
    }
    console.log(`✅ ${genreList.length} genres, largest is "${genreList[0].genre}" (${genreList[0].count}).`);

    // Admin refresh must stay closed without the secret. Only the rejection is
    // asserted; the success path writes to the catalog.
    console.log("\nTesting GET /admin/refresh without a secret ...");
    const adminRes = await fetch(`${BASE_URL}/admin/refresh`);
    if (adminRes.status !== 401) {
      throw new Error(`Admin refresh should refuse unauthenticated calls, got ${adminRes.status}`);
    }
    console.log("✅ Admin refresh refuses unauthenticated calls (401).");

    console.log("\nTesting GET /admin/dedupe without a secret ...");
    const dedupeRes = await fetch(`${BASE_URL}/admin/dedupe`);
    if (dedupeRes.status !== 401) {
      throw new Error(`Admin dedupe should refuse unauthenticated calls, got ${dedupeRes.status}`);
    }
    console.log("✅ Admin dedupe refuses unauthenticated calls (401).");

    console.log("\n🎉 All tests passed successfully!");
  } catch (error) {
    console.error("\n❌ Test failed with error:", error.message);
    process.exit(1);
  }
}

runTests();
