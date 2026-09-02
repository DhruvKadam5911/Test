/*
 * Which catalogue the music endpoints read from.
 *
 * Two sources implement the same four functions and return the same track
 * shape, so the controllers call these and never import a source directly.
 * `MUSIC_SOURCE` picks one; unset means PeerTube, which is what the app
 * shipped with — so adding YouTube changes nothing until someone sets it.
 *
 *   MUSIC_SOURCE=peertube   files the network hands out, playable everywhere
 *   MUSIC_SOURCE=youtube    the catalogue the labels actually publish to
 *
 * The two are not equivalent, and the difference is the whole reason this
 * selector is explicit rather than automatic:
 *
 *   PeerTube gives out the media file. Those tracks play in the deployed app,
 *   legitimately, because the instance publishing them means them to be played.
 *
 *   YouTube gives metadata that is far better — real artists, real albums,
 *   square cover art, the songs people search for. Its audio is another matter:
 *   see the header of youtube.js and of streamController.js. On a deployment,
 *   YouTube tracks are searchable and browsable but will not stream.
 */
import * as peertube from "./peertube.js";
import * as youtube from "./youtube.js";

const SOURCE = () => (process.env.MUSIC_SOURCE || "peertube").toLowerCase();

export function activeSource() {
  const name = SOURCE();
  if (name === "youtube") return youtube;
  if (name === "peertube") return peertube;
  throw new Error(`Unknown MUSIC_SOURCE "${name}" — expected "peertube" or "youtube".`);
}

export function activeSourceName() {
  return SOURCE();
}

export const searchVideos = (args) => activeSource().searchVideos(args);
export const fetchTrending = (args) => activeSource().fetchTrending(args);
export const searchRelated = (args) => activeSource().searchRelated(args);

/*
 * Albums.
 *
 * PeerTube models playlists and channels but neither is wired up, so it has no
 * album search and falls back to songs — which is what the endpoint did before
 * this file existed. YouTube has real albums.
 */
export async function searchAlbums(args) {
  const source = activeSource();
  if (typeof source.searchAlbums === "function") return source.searchAlbums(args);
  return source.searchVideos(args);
}

/*
 * The playable file for a track, chosen by the row's own `source` rather than
 * by the configured one — the Track table outlives a change of MUSIC_SOURCE,
 * so a row imported under one source must still resolve under another.
 */
export async function resolveFileUrl(source, sourceId) {
  if (source === "youtube") return youtube.resolveFileUrl(sourceId);
  if (source === "peertube") return peertube.resolveFileUrl(sourceId);
  return null;
}
