import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { FormulaGridCard } from '../components/FormulaGridCard';
import { GlobalSearch } from '../components/GlobalSearch';
import { subjects, subjectMap } from '../data/subjects';
import { categoryMap } from '../data/categories';
import { formulas } from '../data/formulas';
import { useDetail } from '../context/DetailContext';
import type { CategoryId, SubjectId } from '../types';

type CategoryFilter = CategoryId | 'all';

// Switching between Math / Science / Tech keeps the header (tabs and search)
// exactly where it is and swaps only the content below it, sliding in the
// direction of travel. `custom` is that direction: 1 = to the right.
const bodyVariants: Variants = {
  initial: (dir: number) => ({ opacity: 0, x: dir * 48 }),
  animate: { opacity: 1, x: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
  exit: (dir: number) => ({
    opacity: 0,
    x: -dir * 48,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
  }),
};

const reducedBodyVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

function subjectIndex(id: string | undefined) {
  return Math.max(0, subjects.findIndex((s) => s.id === id));
}

export function SubjectPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { openDetail } = useDetail();
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const reduceMotion = useReducedMotion();

  // Which way we just moved between subjects, held steady across re-renders so
  // the outgoing content keeps the same direction for its whole exit.
  const moveRef = useRef({ from: subjectId, to: subjectId });
  if (moveRef.current.to !== subjectId) moveRef.current = { from: moveRef.current.to, to: subjectId };
  const direction = Math.sign(subjectIndex(moveRef.current.to) - subjectIndex(moveRef.current.from)) || 1;

  const subject = subjectId ? subjectMap[subjectId as SubjectId] : undefined;

  // Reset the filter whenever you land on a different subject, so a filter
  // chosen on /math (e.g. "Algebra") doesn't linger and hide everything
  // when you switch to /science.
  useEffect(() => {
    setActiveCategory('all');
  }, [subjectId]);

  if (!subject) return <Navigate to="/" replace />;

  const visibleCategories =
    activeCategory === 'all' ? subject.categories : subject.categories.filter((c) => c === activeCategory);

  return (
    <div className="subject-page">
      <header className="subject-page-header">
        <div className="subject-switcher">
          {subjects.map((s) => (
            <Link
              key={s.id}
              to={`/${s.id}`}
              className={`subject-pill${s.id === subject.id ? ' subject-pill-active' : ''}`}
            >
              {s.name}
            </Link>
          ))}
          <Link to="/workspace" className="subject-pill">
            Workspace
          </Link>
        </div>
        <div className="subject-page-search">
          <GlobalSearch />
        </div>
      </header>

      <AnimatePresence
        mode="wait"
        initial={false}
        custom={direction}
        onExitComplete={() => window.scrollTo(0, 0)}
      >
        <motion.div
          key={subject.id}
          custom={direction}
          variants={reduceMotion ? reducedBodyVariants : bodyVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
      <div className="subject-page-title">
        <h1>{subject.name}</h1>
        <p>{subject.tagline}</p>
      </div>

      {subject.categories.length > 1 && (
        <div className="category-switcher">
          <button
            type="button"
            className={`subject-pill${activeCategory === 'all' ? ' subject-pill-active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            All
          </button>
          {subject.categories.map((categoryId) => (
            <button
              key={categoryId}
              type="button"
              className={`subject-pill${activeCategory === categoryId ? ' subject-pill-active' : ''}`}
              onClick={() => setActiveCategory(categoryId)}
            >
              {categoryMap[categoryId].short}
            </button>
          ))}
        </div>
      )}

      {visibleCategories.map((categoryId) => {
        const cat = categoryMap[categoryId];
        const items = formulas.filter((f) => f.category === categoryId);
        if (items.length === 0) return null;
        return (
          <section key={categoryId} className="category-section">
            <h2 className="category-heading">{cat.name}</h2>
            <div className="formula-grid">
              {items.map((f, i) => (
                <FormulaGridCard key={f.id} formula={f} index={i} onClick={openDetail} />
              ))}
            </div>
          </section>
        );
      })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
