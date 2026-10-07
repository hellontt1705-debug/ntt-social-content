import React, { useState, useRef, useEffect, memo } from "react";

const FALLBACK_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='550' viewBox='0 0 400 550'><rect width='400' height='550' fill='%230f172a'/><circle cx='200' cy='240' r='40' fill='rgba(139,92,246,0.15)' stroke='%238b5cf6' stroke-width='2'/><polygon points='193,225 217,240 193,255' fill='%23a78bfa'/><text x='200' y='320' text-anchor='middle' fill='%2364748b' font-size='13' font-family='system-ui,sans-serif'>VIDEO PREVIEW</text></svg>";

/**
 * LazyThumbnail - Lazy-load thumbnail using IntersectionObserver.
 * Only starts loading the image when the element enters the viewport.
 * Shows a skeleton placeholder while loading, then fades in the image.
 */
const LazyThumbnail = memo(function LazyThumbnail({ src, alt, className = "video-thumb" }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [src]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    // Use IntersectionObserver to detect when the thumbnail enters viewport
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Stop observing once visible
        }
      },
      {
        rootMargin: "300px", // Start loading 300px before entering viewport
        threshold: 0.01,
      }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [src]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  const imgSrc = hasError ? FALLBACK_IMG : (src || FALLBACK_IMG);

  return (
    <div ref={containerRef} className="lazy-thumb-wrapper">
      {/* Skeleton placeholder - shows until image is loaded */}
      {!isLoaded && <div className="thumb-skeleton" />}

      {/* Actual image - only rendered when visible in viewport */}
      {isVisible && (
        <img
          src={imgSrc}
          alt={alt || ""}
          className={`${className} ${isLoaded ? "thumb-loaded" : "thumb-loading"}`}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
});

export default LazyThumbnail;
