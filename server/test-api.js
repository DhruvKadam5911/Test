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

    // A misspelling has to work, or the catalog is only reachable by people who
    // already know how to spell what they are looking for.
    const longWord = firstTitle.title.split(" ").find((w) => w.length >= 5);
    if (longWord) {
      // Swap two adjacent letters — the most ordinary typo there is.
      const typo = longWord.slice(0, 1) + longWord[2] + longWord[1] + longWord.slice(3);
      const typoRes = await fetch(`${BASE_URL}/titles/search?q=${encodeURIComponent(typo)}`);
      if (!typoRes.ok) throw new Error(`Fuzzy search failed with status: ${typoRes.status}`);
      const fuzzy = await typoRes.json();
      if (!fuzzy.some((t) => t.id === firstTitle.id)) {
        throw new Error(`Misspelling "${typo}" did not find "${firstTitle.title}"`);
      }
      console.log(`✅ Misspelled "${typo}" still found "${firstTitle.title}".`);
    }

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


    /*
     * Music.
     *
     * These assert the contract rather than any particular song: a JSON array,
     * and tracks carrying the fields the Music page reads. What comes back
     * depends on a live upstream, so asserting a title here would make the
     * smoke test fail on YouTube's bad day rather than on our bug.
     */
    console.log("\nTesting GET /music/tracks ...");
    const tracksRes = await fetch(`${BASE_URL}/music/tracks?limit=10`);
    if (!tracksRes.ok) throw new Error(`Music tracks failed with status: ${tracksRes.status}`);
    const tracks = await tracksRes.json();
    if (!Array.isArray(tracks)) throw new Error("Music tracks did not return an array.");
    console.log(`\u2705 /music/tracks returned ${tracks.length} track(s).`);

    if (tracks.length) {
      for (const field of ["sourceId", "title", "artist"]) {
        if (!tracks[0][field]) throw new Error(`First track is missing "${field}"`);
      }
      console.log(`\ud83d\udc49 First track: "${tracks[0].title}" — ${tracks[0].artist} (${tracks[0].source})`);
    }

    // Under two characters must be an empty array, not a search.
    console.log("\nTesting GET /music/search ...");
    const shortRes = await fetch(`${BASE_URL}/music/search?q=a`);
    const shortBody = await shortRes.json();
    if (!Array.isArray(shortBody) || shortBody.length !== 0) {
      throw new Error("A one-character query should return an empty array.");
    }
    const songsRes = await fetch(`${BASE_URL}/music/search?q=kesariya`);
    if (!songsRes.ok) throw new Error(`Music search failed with status: ${songsRes.status}`);
    const songs = await songsRes.json();
    if (!Array.isArray(songs)) throw new Error("Music search did not return an array.");
    console.log(`\u2705 /music/search returned ${songs.length} song(s).`);

    console.log("\nTesting GET /music/albums ...");
    const albumsRes = await fetch(`${BASE_URL}/music/albums?q=brahmastra`);
    if (!albumsRes.ok) throw new Error(`Music albums failed with status: ${albumsRes.status}`);
    if (!Array.isArray(await albumsRes.json())) throw new Error("Music albums did not return an array.");
    console.log("\u2705 /music/albums returned an array.");

    // The queue must never hand back the song that is already playing.
    console.log("\nTesting GET /music/related ...");
    const seed = songs[0] || tracks[0];
    if (seed) {
      const params = new URLSearchParams({
        title: seed.title, artist: seed.artist || "", exclude: seed.sourceId, limit: "10",
      });
      const relRes = await fetch(`${BASE_URL}/music/related?${params}`);
      if (!relRes.ok) throw new Error(`Music related failed with status: ${relRes.status}`);
      const related = await relRes.json();
      if (!Array.isArray(related)) throw new Error("Music related did not return an array.");
      if (related.some((t) => t.sourceId === seed.sourceId)) {
        throw new Error("Related tracks contain the excluded track.");
      }
      console.log(`\u2705 /music/related returned ${related.length} track(s), excluding the seed.`);
    } else {
      console.log("\u26a0\ufe0f No tracks to seed /music/related with — skipped.");
    }

    /*
     * The stream endpoint's refusal, which is the part worth asserting here. A
     * real play needs a resolvable format and a live upstream, neither of which
     * a test can promise — YouTube rotates its player cipher and resolving
     * breaks until youtubei.js catches up. What must hold unconditionally is
     * that an id the catalog does not know 404s, with the `error` key intact.
     */
    console.log("\nTesting GET /music/stream/:id with an unknown id ...");
    const missingRes = await fetch(`${BASE_URL}/music/stream/definitely-not-a-real-track-id`);
    // 404 when the row is absent, 409 when it is present but nothing playable
    // came back. Either is a refusal; a 2xx here would mean bytes were served
    // for an id nothing in the catalog knows.
    if (missingRes.status !== 404 && missingRes.status !== 409) {
      throw new Error(`An unknown track should be refused (404 or 409), got ${missingRes.status}`);
    }
    const missingBody = await missingRes.json();
    if (!missingBody.error) throw new Error("The stream refusal dropped the `error` key.");
    console.log(`\u2705 /music/stream/:id refuses an unknown id (${missingRes.status}), with an \`error\` key.`);

    console.log("\n🎉 All tests passed successfully!");
  } catch (error) {
    console.error("\n❌ Test failed with error:", error.message);
    process.exit(1);
  }
}

runTests();
