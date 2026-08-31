import React, { useEffect, useRef, useState } from "react";
import ContentRow from "./ContentRow";
import api from "../api/client";

/*
 * One catalog row that fetches its own titles.
 *
 * The home page used to slice every row out of a single 100-title response,
 * which meant a 7,000-title catalog showed about a hundred of them. Each row
 * now queries for its own genre instead.
 *
 * It waits until it is near the viewport before asking. Twenty-odd rows all
 * firing on load would put the browser's connection limit between the visitor
 * and the first thing they can see.
 */

const ROW_SIZE = 20;
// Start fetching before the row is on screen, so it is populated by the time
// the visitor scrolls to it.
const PREFETCH_MARGIN = "600px";

export default function GenreRow({ genre, size = "md" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    // Without IntersectionObserver, just load — better than showing nothing.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: PREFETCH_MARGIN }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(
        `/titles?genre=${encodeURIComponent(genre)}&limit=${ROW_SIZE}`
      );
      setItems(data);
    } catch (err) {
      console.error(`GenreRow "${genre}" error:`, err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, genre]);

  return (
    <div ref={ref}>
      <ContentRow
        title={genre}
        items={items}
        size={size}
        loading={loading || !visible}
        error={error}
        onRetry={load}
      />
    </div>
  );
}
