import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { FormulaGridCard } from '../components/FormulaGridCard';
import { GlobalSearch } from '../components/GlobalSearch';
import { subjects, subjectMap } from '../data/subjects';
import { categoryMap } from '../data/categories';
import { formulas } from '../data/formulas';
import { useDetail } from '../context/DetailContext';
import type { CategoryId, SubjectId } from '../types';

type CategoryFilter = CategoryId | 'all';

export function SubjectPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { openDetail } = useDetail();
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');

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
        <Link to="/" className="subject-page-home glass">
          ← Derive
        </Link>
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
              {items.map((f) => (
                <FormulaGridCard key={f.id} formula={f} onClick={openDetail} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
