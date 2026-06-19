import { useEffect, useRef } from 'react';

export function useScrollAnimation() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    // Observe all .animate-enter children
    const animatables = el.querySelectorAll('.animate-enter');
    animatables.forEach((child) => observer.observe(child));

    return () => observer.disconnect();
  }, []);

  return ref;
}
