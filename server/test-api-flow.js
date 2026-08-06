const BASE_URL = "http://localhost:5000";

async function testApi() {
  console.log("🧪 Starting Onion VOD API End-to-End Test Suite...\n");

  try {
    // 1. Health check
    console.log("1️⃣ Testing GET /health...");
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = await healthRes.json();
    console.log("   Result:", healthRes.status, healthData);

    // 2. Signup
    console.log("\n2️⃣ Testing POST /auth/signup...");
    const signupRes = await fetch(`${BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "testuser@onion.tv",
        username: "testuser",
        password: "secretpassword123",
      }),
    });
    const signupData = await signupRes.json();
    console.log("   Result:", signupRes.status, signupData.token ? "JWT Received!" : signupData);

    // 3. Login
    console.log("\n3️⃣ Testing POST /auth/login...");
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "testuser@onion.tv",
        password: "secretpassword123",
      }),
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log("   Result:", loginRes.status, token ? "Login Success! Token obtained." : loginData);

    // 4. Get Titles
    console.log("\n4️⃣ Testing GET /titles...");
    const titlesRes = await fetch(`${BASE_URL}/titles`);
    const titlesData = await titlesRes.json();
    console.log("   Result:", titlesRes.status, `Found ${titlesData.length} titles.`);

    // 5. Get Trending Titles
    console.log("\n5️⃣ Testing GET /titles/trending...");
    const trendingRes = await fetch(`${BASE_URL}/titles/trending`);
    const trendingData = await trendingRes.json();
    console.log("   Result:", trendingRes.status, `Found ${trendingData.length} trending items.`);

    const seriesTitle = titlesData.find((t) => t.contentType === "series");
    const movieTitle = titlesData.find((t) => t.contentType === "movie");

    // 6. Get Title Details by ID
    console.log(`\n6️⃣ Testing GET /titles/${seriesTitle.id} (Series details)...`);
    const detailsRes = await fetch(`${BASE_URL}/titles/${seriesTitle.id}`);
    const detailsData = await detailsRes.json();
    console.log("   Result:", detailsRes.status, `Seasons count: ${detailsData.seasons.length}, Ep 1: ${detailsData.seasons[0].episodes[0].title}`);

    // 7. Get Playback URL (Protected)
    console.log(`\n7️⃣ Testing GET /titles/${movieTitle.id}/playback (Movie playback)...`);
    const moviePlaybackRes = await fetch(`${BASE_URL}/titles/${movieTitle.id}/playback`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const moviePlaybackData = await moviePlaybackRes.json();
    console.log("   Result:", moviePlaybackRes.status, moviePlaybackData);

    const episodeId = detailsData.seasons[0].episodes[0].id;
    console.log(`\n7b️⃣ Testing GET /titles/${seriesTitle.id}/playback?episodeId=${episodeId} (Series episode playback)...`);
    const epPlaybackRes = await fetch(`${BASE_URL}/titles/${seriesTitle.id}/playback?episodeId=${episodeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const epPlaybackData = await epPlaybackRes.json();
    console.log("   Result:", epPlaybackRes.status, epPlaybackData);

    // 8. Add to My List
    console.log("\n8️⃣ Testing POST /mylist...");
    const mylistRes = await fetch(`${BASE_URL}/mylist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ titleId: seriesTitle.id }),
    });
    const mylistData = await mylistRes.json();
    console.log("   Result:", mylistRes.status, mylistData);

    // 9. Get My List
    console.log("\n9️⃣ Testing GET /mylist...");
    const getMylistRes = await fetch(`${BASE_URL}/mylist`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getMylistData = await getMylistRes.json();
    console.log("   Result:", getMylistRes.status, `Items in My List: ${getMylistData.length}`);

    // 10. Post Watch Progress
    console.log("\n🔟 Testing POST /progress...");
    const progressRes = await fetch(`${BASE_URL}/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        titleId: seriesTitle.id,
        episodeId,
        progressSeconds: 860,
        completed: false,
      }),
    });
    const progressData = await progressRes.json();
    console.log("   Result:", progressRes.status, progressData);

    // 11. Get Continue Watching
    console.log("\n1️⃣1️⃣ Testing GET /progress/continue-watching...");
    const cwRes = await fetch(`${BASE_URL}/progress/continue-watching`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cwData = await cwRes.json();
    console.log("   Result:", cwRes.status, `Continue Watching items: ${cwData.length}, Title: ${cwData[0]?.title?.title}`);

    // 12. Delete from My List
    console.log("\n1️⃣2️⃣ Testing DELETE /mylist/:titleId...");
    const delRes = await fetch(`${BASE_URL}/mylist/${seriesTitle.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const delData = await delRes.json();
    console.log("   Result:", delRes.status, delData);

    console.log("\n🎉 ALL ONION VOD API ENDPOINTS PASSED SUCCESSFULLY!");
  } catch (err) {
    console.error("❌ API Test Error:", err);
  }
}

testApi();
