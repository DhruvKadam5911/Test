import prisma from "../src/config/db.js";

async function main() {
  console.log("🌱 Seeding Onion VOD catalog titles...");

  // Delete existing records
  await prisma.myListItem.deleteMany();
  await prisma.watchProgress.deleteMany();
  await prisma.episode.deleteMany();
  await prisma.season.deleteMany();
  await prisma.title.deleteMany();

  // 1. Undertow (Series)
  const undertow = await prisma.title.create({
    data: {
      title: "Undertow",
      description: "A dockworker uncovers a smuggling route beneath the city she swore to leave. Eight episodes. New season out now.",
      contentType: "series",
      genre: "Sci-Fi",
      releaseYear: 2026,
      rating: "TV-MA",
      thumbnailUrl: "linear-gradient(135deg, #3A1F22, #17141A)",
      heroImageUrl: "linear-gradient(135deg, #3A1F22, #17141A)",
      isOriginal: true,
      seasons: {
        create: [
          {
            seasonNumber: 1,
            synopsis: "Maya uncovers an encrypted quantum signal array beneath Sector 40.",
            episodes: {
              create: [
                {
                  episodeNumber: 1,
                  title: "1. Pilot — The Signal",
                  description: "Maya investigates an unmapped power grid surge below Sector 40 and discovers hidden cargo docks.",
                  durationMinutes: 48,
                  thumbnailUrl: "linear-gradient(135deg, #3A1F22, #17141A)",
                  playbackUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
                },
                {
                  episodeNumber: 2,
                  title: "2. Cold Chamber",
                  description: "With security forces closing in, Maya hides inside an automated refrigeration vault.",
                  durationMinutes: 44,
                  thumbnailUrl: "linear-gradient(135deg, #1F2436, #17141A)",
                  playbackUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
                }
              ]
            }
          }
        ]
      }
    }
  });

  // 2. How Bread Works (Movie)
  const howBreadWorks = await prisma.title.create({
    data: {
      title: "How Bread Works",
      description: "Exploring ferments, gluten network mechanics, and high hydration crust formation in wood-fired ovens.",
      contentType: "movie",
      genre: "Documentary",
      releaseYear: 2025,
      rating: "PG",
      durationMinutes: 88,
      thumbnailUrl: "linear-gradient(135deg, #241B2E, #17141A)",
      heroImageUrl: "linear-gradient(135deg, #241B2E, #17141A)",
      playbackUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      isOriginal: false
    }
  });

  // 3. Building a Synth from Scratch (Movie)
  const synthDoc = await prisma.title.create({
    data: {
      title: "Building a Synth from Scratch",
      description: "Solder your own analog voltage-controlled oscillators, ladder filters, and spatial ping delay nodes.",
      contentType: "movie",
      genre: "Technology",
      releaseYear: 2026,
      rating: "PG-13",
      durationMinutes: 52,
      thumbnailUrl: "linear-gradient(135deg, #2A2418, #17141A)",
      heroImageUrl: "linear-gradient(135deg, #2A2418, #17141A)",
      playbackUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      isOriginal: false
    }
  });

  console.log("✅ Seed completed successfully!");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Seed error:", e);
  process.exit(1);
});
