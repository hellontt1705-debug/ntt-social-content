import React, { useState, useRef, useEffect, memo } from "react";

const FALLBACK_IMG = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80";

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
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
});

export default LazyThumbnail;
