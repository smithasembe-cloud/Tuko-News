type AdPlacement = 'feed-inline' | 'article-inline';

/** Reserved placement marker. Intentionally renders no box until an ad unit exists. */
export function AdSlot({ placement }: { placement: AdPlacement }) {
  return <div hidden aria-hidden="true" data-placement={placement} />;
}