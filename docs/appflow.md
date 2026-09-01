# Onion TV — Application Flow

> **Status:** Living document. Last updated 2026-08-31.
> Update this file whenever a route, screen, navigation path, or data-fetch sequence changes.

---

## 1. Routes

Defined in `src/App.jsx`, mounted under `BrowserRouter` in `src/main.tsx`.

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | `pages/Home.jsx` | Browse — hero, then four rows: trending, most viewed, most rated, recently released. Search replaces them |
| `/music` | `pages/MusicPage.jsx` | The music app: left rail, search, mood chips, card rows, and a bar that stays put. Opens to a now-playing stage with a Song/Video switch |
| `/genre/:genre` | `pages/GenrePage.jsx` | One genre as a paged grid. Rows hold twenty; these genres hold thousands |
| `/watch/:videoId` | `pages/WatchPage.jsx` | Title detail and playback |
| `/wheel` | `pages/WheelDemo.jsx` | Demo surface for `PickerWheel`. Not linked from anywhere in the app — reachable only by typing the URL |

**No 404 route** —
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
SplashIntro tries for sound, and never waits on it:
     AudioContext running    → schedule the soundtrack
     AudioContext suspended  → run silently, no prompt
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
| `fetchGenres()` | `GET /titles/genres` | One row per genre — the rows fetch their own titles |
| `fetchOriginals()` | `GET /titles?isOriginal=true&limit=20` | The Originals row |

A third request follows once trending resolves: `GET /titles/{trending[0].id}` for the hero's
description. The list projections deliberately omit `description` (see schema.md), so the hero
has to read the featured title's own record. Failing it costs the description only.

Both trending and the pool surface failures with a retry button; a failed pool fetch replaces
Originals and the genre rows with one *"Couldn't load the catalog — try again"* row rather than
emptying the page silently.

### Derived state (all `useMemo` over `pool`)

**Each genre row fetches its own titles**, through `GenreRow`, when it comes within 600px of the
viewport. The page used to slice every row out of one 100-title response, which showed about a
hundred titles of a seven-thousand-title catalog. Loading all rows at once instead would put
twenty-odd requests between the visitor and the first thing they can see.

**Search runs on the server**, debounced 300ms, against the whole catalog. A stale response for
an abandoned query is discarded rather than allowed to overwrite a newer one.

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

`Home` owns the search text and passes it to `AppNavbar` as a controlled value. It has to: the
navbar renders inside the hero while browsing and outside it while searching, so the first
keystroke moves it in the tree and React remounts it. With the text held in the navbar, that
remount closed the box and threw the query away mid-word.

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
{ playbackUrl }  →  held back; the brand ident plays in the player box first
                 →  ident onDone → <video src autoPlay> mounts; the bar returns
```

Two things can fail here, and both land on the same in-player error surface with a Retry
button — never a browser dialog:

| Failure | Message |
|---------|---------|
| The request fails | Whatever `api/client.js` produced, e.g. *"Unable to connect to streaming server…"* |
| The `<video>` element fails | Mapped from `MediaError.code` — 2 lost connection, 3 corrupt/unsupported, 4 could not be loaded |

The element failure matters as much as the request one: an unreachable or unsupported stream
would otherwise leave a silent black box. Retry clears `playbackUrl` before refetching, because
the same stream usually resolves to the same URL and React would not remount the element for an
unchanged `src`.

### Brand ident

The ident starts on the **click**, not on the response — resolving a stream takes ~600ms against
the deployed API, and waiting for it left the player doing nothing after you pressed play. The
resolved URL is held in `pendingPlaybackUrl` while `SplashWheel` plays inside the 16:9 box — the same wheel the phone splash uses, rendered
inline at `IDENT_ITEM_HEIGHT` instead of full screen. Its `onDone` promotes the URL and starts
playback. Roughly 3.9s from clicking play to the first frame: the wheel settles on Onion, the
lockup glides to the centre of the frame, then the camera pushes through it into the video.

Holding the URL is the point: mounting the video behind the ident would start its audio
underneath. The transport bar and the poster's play button are both hidden while it runs.

**Whichever finishes last gates the video** — the ident or the request. A stream that resolves
after the ident simply keeps it on screen until it arrives. A request that *fails* ends the ident
at once, so the error is not stuck behind three seconds of animation.

Unlike the splash, the ident **has sound** — by the time someone clicks play they have interacted
with the page, so the browser's autoplay block no longer applies.

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
| WatchPage | playback request or element failed | In-player message + Retry, matching `ContentRow`'s pattern |
| API client | network failure | Normalised to *"Unable to connect to streaming server…"* |
| Any unmatched route | — | Blank page (no 404 route) |

---

## 7. Flows that do not exist yet

These have database models but no route, endpoint, or screen. Do not assume they work.

- Sign up / sign in / sign out (`User`)
- Continue watching / resume position (`WatchProgress`)
- Add to / remove from My List (`MyListItem`)
- Creator upload — there is no upload path at all; see PRD non-goals
