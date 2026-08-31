# Onion TV — Application Flow

> **Status:** Living document. Last updated 2026-08-31.
> Update this file whenever a route, screen, navigation path, or data-fetch sequence changes.

---

## 1. Routes

Defined in `src/App.jsx`, mounted under `BrowserRouter` in `src/main.tsx`.

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | `pages/Home.jsx` | Browse — hero, trending, originals, genre rows, search |
| `/watch/:videoId` | `pages/WatchPage.jsx` | Title detail and playback |
| `/wheel` | `pages/WheelDemo.jsx` | Demo surface for `PickerWheel`. Not linked from anywhere in the app — reachable only by typing the URL |

**Not routed:** `pages/StudioPage.jsx` exists but is unreachable. There is no 404 route —
any unmatched path renders an empty page below the splash.

---

## 2. Cold start

```
Browser loads index.html
        ↓
main.tsx → StrictMode → BrowserRouter → App
        ↓
App renders <SplashIntro> (showSplash = true) OVER the routed page
        ↓
SplashIntro probes autoplay permission
        ↓
   ┌────┴─────────────────────────────┐
   │                                  │
AudioContext running            AudioContext suspended
   │                                  │
play sound + start timeline      show "Click anywhere to play with sound"
   │                                  │  ← user clicks
   │                                  ↓
   │                            play sound + start timeline
   └────────────┬─────────────────────┘
                ↓
   SplashIntro picks a variant by viewport width (once, at mount):
     >= 768px  → SplashConstruct (dots → anchors → outlines → solid wordmark)
     <  768px  → SplashWheel, below

   0ms      PickerWheel starts spinning through the platform list
   0-2000ms one full turn + travel back to Onion, decelerating (+ ticks)
   2000ms   locks on "Onion" → PickerWheel calls onSettled (+ chime)
   2000ms   onion mark drops in, replacing the arrow marker
   2380ms   losing platforms fade out — only the lockup is left
   2620ms   the lockup zooms toward the viewer (11x), background dissolving
   3440ms   onDone() → showSplash = false
```

The routed page mounts and fetches **underneath** the splash, so by the time the splash
clears, Home is usually already populated.

---

## 3. Home (`/`)

### Data fetches — both fire in parallel on mount

| Call | Endpoint | Feeds |
|------|----------|-------|
| `fetchTrending()` | `GET /titles/trending` | Hero (item `[0]`) + "Trending Now" row |
| `fetchPool()` | `GET /titles?limit=100` | Onion Originals + all genre rows + search |

Trending owns the only visible error state (`errorTrending`) and the only retry button.
A failed pool fetch logs to console and leaves rows empty — see `tracker.md` H2.

### Derived state (all `useMemo` over `pool`)

- `genreRows` — group by `genre`, sorted by descending item count. New genres appear automatically.
- `originals` — `pool.filter(t => t.isOriginal)`.
- `searchResults` — case-insensitive substring match on `title` or `genre`. `null` when the query is empty.

### Two render modes

```
searchQuery empty                    searchQuery non-empty
─────────────────                    ─────────────────────
AppNavbar                            AppNavbar
Cinematic hero                       "Search results for …"
Trending Now (ranked)                Results row (or "No matches for …")
Onion Originals (if any)
Genre rows (dynamic)
Footer                               Footer
```

The hero and all rows are **replaced**, not filtered in place, while searching.

### Exits

| Action | Goes to |
|--------|---------|
| "Watch now" / "More Info" on hero | `/watch/{featuredTitle.id}` |
| Any `ContentCard` click | `/watch/{item.id}` |
| Navbar logo | `/` |

---

## 4. Watch (`/watch/:videoId`)

### Fetch sequence

```
mount / videoId change
        ↓
window.scrollTo(top)
        ↓
GET /titles/:videoId          ── 404 → error state with retry
        ↓
titleData set; season 0, episode 0 selected
        ↓
if (titleData.genre)
   GET /titles?genre={genre}&limit=6
        ↓
recommendations = results minus the current title
```

`playbackUrl` is deliberately **not** fetched here. The detail response never contains a
stream URL — for movies it is stripped, for episodes it is excluded from the Prisma `select`.

### Playback

```
user clicks the centre play button
        ↓
movie   → GET /titles/:id/playback
series  → GET /titles/:id/playback?episodeId={activeEpisode.id}
        ↓
server: resolvePlaybackUrl(storedUrl)
        ↓
{ playbackUrl }  →  <video src autoPlay> replaces the poster; the custom bar stays
```

On failure the current code shows a browser `alert()` — see `tech-spec.md` T5.

### Overlay panel

Toggled by the tab in the player's top-right corner. Only rendered while `playbackUrl` is
null, so it disappears once video is playing.

| Content type | Overlay shows |
|--------------|---------------|
| `series` | Season `<select>` + episode list with numbers, durations, descriptions |
| `movie` | "More Like This" — the same-genre recommendations |

Changing season or episode resets `currentTimeSec`, clears `playbackUrl` and sets
`isPlaying` false, so the user must press play again for the new episode.

### Transport bar

The custom bar **is** the player's control surface — the `<video>` renders without native
`controls`, and the bar sits over both the poster and the video.

| Control | Wired to |
|---------|----------|
| Scrubber position | `onTimeUpdate` on the element (skipped while dragging, so the drag owns the playhead) |
| Scrubber drag | `seekTo()` — sets state *and* `video.currentTime` |
| Duration | `onLoadedMetadata` → the element's real `duration`; falls back to `durationMinutes` before metadata arrives |
| Play / pause | `video.play()` / `video.pause()`; `onPlay`/`onPause`/`onEnded` feed `isPlaying` back |
| Mute | `video.muted` |
| Fullscreen | `requestFullscreen()` on the player container |

Before a stream is fetched there is no element, so the bar falls back to a `setInterval`
preview against the catalog's estimated duration. That timer is gated on `!playbackUrl` — it
must never run alongside the element or the two fight over `currentTimeSec`.

---

## 5. Navigation graph

```
        ┌──────────────────────────────┐
        │        SplashIntro           │  (overlay, once per session)
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
   ┌───►│           Home  /            │◄──── navbar logo
   │    └──────┬───────────────┬───────┘
   │           │ card / hero   │ search (in-place, no route change)
   │           ▼               ▼
   │    ┌──────────────┐   ┌──────────────┐
   │    │ /watch/:id   │   │ Results view │
   │    └──────┬───────┘   └──────────────┘
   │           │ recommendation card → /watch/:otherId (remount, refetch)
   └───────────┘
```

---

## 6. Error and empty states

| Where | Condition | Behaviour |
|-------|-----------|-----------|
| Home hero | `loadingTrending` | Pulsing skeleton block |
| Home hero | trending empty | Renders nothing (no empty-state copy) |
| Trending row | `errorTrending` | Error message + retry button calling `fetchTrending()` |
| Any row | `loading` | `CardSkeleton` placeholders |
| Search | zero matches | `No matches for "{query}"` |
| WatchPage | fetch failed | Error message + retry |
| WatchPage | playback failed | `alert()` (to be replaced) |
| API client | network failure | Normalised to *"Unable to connect to streaming server…"* |
| Any unmatched route | — | Blank page (no 404 route) |

---

## 7. Flows that do not exist yet

These have database models but no route, endpoint, or screen. Do not assume they work.

- Sign up / sign in / sign out (`User`)
- Continue watching / resume position (`WatchProgress`)
- Add to / remove from My List (`MyListItem`)
- Creator upload (`StudioPage.jsx` simulates progress with a timer and is unrouted)
