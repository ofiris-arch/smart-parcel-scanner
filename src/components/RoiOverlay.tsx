import { type RefObject, useLayoutEffect, useMemo, useState } from "react";
import { mapRectToDisplay } from "../lib/roiMapper";
import type { LabelRoi } from "../lib/types";

interface RoiOverlayProps {
  containerRef: RefObject<HTMLElement | null>;
  roi: LabelRoi | null;
  videoWidth: number;
  videoHeight: number;
}

/**
 * Static axis-aligned rectangle — matches detection bounds, no animation.
 */
export function RoiOverlay({
  containerRef,
  roi,
  videoWidth,
  videoHeight,
}: RoiOverlayProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const box = useMemo(() => {
    if (!roi || !size.w || !videoWidth || !videoHeight) return null;
    return mapRectToDisplay(roi.rect, videoWidth, videoHeight, size.w, size.h);
  }, [roi, videoWidth, videoHeight, size.w, size.h]);

  if (!size.w) return null;

  const maskId = "roi-rect-mask";

  if (!box || box.width < 4 || box.height < 4) {
    return (
      <svg
        className="roi-overlay"
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        aria-hidden
      >
        <rect
          className="roi-guide"
          x="8%"
          y="18%"
          width="84%"
          height="52%"
          fill="none"
          stroke="var(--muted)"
          strokeWidth={1.5}
          strokeDasharray="8 6"
        />
      </svg>
    );
  }

  return (
    <svg
      className="roi-overlay"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      aria-hidden
    >
      <defs>
        <mask id={maskId}>
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            fill="black"
          />
        </mask>
      </defs>

      <rect
        width="100%"
        height="100%"
        fill="rgba(15, 23, 42, 0.5)"
        mask={`url(#${maskId})`}
      />

      <rect
        className="roi-box"
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
      />
    </svg>
  );
}
