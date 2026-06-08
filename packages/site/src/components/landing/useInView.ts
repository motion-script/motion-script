import { useEffect, useRef, useState, type RefObject } from 'react';

interface UseInViewOptions {
  /** Only trigger once, then stop observing. */
  once?: boolean;
  /** Root margin passed to the IntersectionObserver (e.g. '-100px'). */
  margin?: string;
}

/**
 * Lightweight replacement for framer-motion's `useInView`, backed by a native
 * IntersectionObserver. Returns a ref to attach to the target element and a
 * boolean that flips to `true` once the element enters the viewport.
 */
export function useInView<T extends Element = HTMLDivElement>(
  options: UseInViewOptions = {},
): [RefObject<T | null>, boolean] {
  const { once = false, margin = '0px' } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Bail out gracefully where IntersectionObserver is unavailable (SSR/old
    // browsers): just show the content.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin: margin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once, margin]);

  return [ref, inView];
}
