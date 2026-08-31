import React, { useState, useEffect, useRef } from "react";
import ContentRow from "./ContentRow";
import api from "../api/client";

/*
 * One row for one genre, fetching its own titles when it comes into view.
 *
 * Loading every genre up front would be a dozen requests before the page has
 * drawn anything, for rows most viewers never scroll to. The margin means the
 * request goes out before the row is visible, so the cards are usually there by
 * the time it is.
 */

const ROW_SIZE = 20;
const PREFETCH_MARGIN = "600px";

export default function GenreRow({ genre }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);

  const load = async () => {
    setError(null);
    try {
      const data = await api.get(
        `/titles?genre=${encodeURIComponent(genre)}&sort=viewed&limit=${ROW_SIZE}`
      );
      setItems(data);
    } catch (err) {
      console.error(`fetch ${genre} row error:`, err);
      setError(err.message);
      setItems([]);
    }
  };

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: PREFETCH_MARGIN }
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genre]);

  return (
    <div ref={containerRef}>
      <ContentRow
        title={genre}
        items={items || []}
        size="md"
        loading={items === null}
        error={error}
        onRetry={load}
      />
    </div>
  );
}
