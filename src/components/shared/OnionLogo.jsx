import React from 'react';
import OnionMark from './OnionMark';
import OnionWordmark from './OnionWordmark';
import { colors } from '../../theme';

/*
 * OnionLogo — the full lockup: the bulb mark beside the wordmark.
 *
 * It used to draw public/logo.png whole, which has an uppercase "ONION" in an
 * unrelated sans baked into the raster. The wordmark is now drawn from the
 * brand geometry instead, so the navbar, the footer and the intros all show
 * the same letterforms.
 *
 * `height` is the lockup's height, taken from the mark; the wordmark is set
 * against it so the two stay in proportion at any size.
 */

// The drawn wordmark's letters, as a fraction of the mark's height. The mark's
// raster carries a lot of transparent padding, so matching the two box heights
// would leave the wordmark towering over the bulb.
const WORDMARK_RATIO = 0.42;

export function OnionLogo({ height = 90, className = "" }) {
  return (
    <div className={`flex items-center ${className}`} style={{ gap: height * 0.06 }}>
      <OnionMark height={height} />
      <OnionWordmark height={height * WORDMARK_RATIO} color={colors.text} />
    </div>
  );
}

export default OnionLogo;
