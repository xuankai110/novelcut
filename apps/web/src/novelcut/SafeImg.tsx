import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";

/** A drop-in replacement for <img> that
 *  1) tracks load failure in React state (so parent can also react),
 *  2) automatically resets the broken flag whenever the `src` prop changes,
 *  3) renders a `fallback` element when broken (so the user sees a useful message,
 *     not a tiny native broken-image icon).
 *
 *  The auto-reset behavior is the whole point — without it, an image that failed
 *  once stays "broken" in the UI even after the URL changes (e.g. after a
 *  regenerate operation), which forces a hard refresh.
 */
export function SafeImg({
  src,
  fallback,
  onBroken,
  onLoaded,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | undefined;
  fallback: ReactNode;
  onBroken?: () => void;
  onLoaded?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  if (!src || broken) return <>{fallback}</>;
  return (
    <img
      {...rest}
      src={src}
      onError={() => { setBroken(true); onBroken?.(); }}
      onLoad={() => { setBroken(false); onLoaded?.(); }}
    />
  );
}
