import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { useEffect, useState } from 'react';

const wordVariants: Variants = {
  hidden: { y: 30, opacity: 0, filter: 'blur(6px)' },
  visible: { y: 0, opacity: 1, filter: 'blur(0px)' },
  exit: { y: -30, opacity: 0, filter: 'blur(6px)' },
};

interface RotatingWordProps {
  words: string[];
  interval?: number;
}

export function RotatingWord({ words, interval = 2500 }: RotatingWordProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % words.length), interval);
    return () => clearInterval(timer);
  }, [words.length, interval]);

  return (
    <span aria-hidden className="relative inline-flex h-[1.2em] overflow-hidden align-bottom">
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          variants={wordVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="whitespace-nowrap"
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
