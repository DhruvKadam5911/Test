/*
 * Renders a Title row as a raw INSERT.
 *
 * Used by both importers so the column list and escaping live in one place —
 * a mismatch between them would only surface as a failed paste into a database
 * console, long after the fact.
 *
 * `id` and `updatedAt` are filled in here because neither has a database
 * default: Prisma generates both on the client, so an INSERT that omits them
 * fails on a NOT NULL violation.
 */

const COLUMNS = [
  "id",
  "title",
  "description",
  "contentType",
  "genre",
  "releaseYear",
  "rating",
  "durationMinutes",
  "thumbnailUrl",
  "heroImageUrl",
  "playbackUrl",
  "isOriginal",
  "updatedAt",
];

const quote = (v) =>
  v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;

const bare = (v) => (v === null || v === undefined ? "NULL" : String(v));

export function toInsert(row) {
  const values = [
    "gen_random_uuid()",
    quote(row.title),
    quote(row.description),
    quote(row.contentType),
    quote(row.genre),
    bare(row.releaseYear),
    quote(row.rating),
    bare(row.durationMinutes),
    quote(row.thumbnailUrl),
    quote(row.heroImageUrl),
    quote(row.playbackUrl),
    bare(row.isOriginal),
    "NOW()",
  ];

  return (
    `INSERT INTO "Title" (${COLUMNS.map((c) => `"${c}"`).join(", ")})\n` +
    `VALUES (${values.join(", ")});`
  );
}
