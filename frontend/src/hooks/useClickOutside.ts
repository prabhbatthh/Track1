import { useEffect, type RefObject } from 'react';

export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutsideClick: () => void): void {
  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const node = ref.current;
      if (!node || node.contains(event.target as Node)) return;
      onOutsideClick();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}
