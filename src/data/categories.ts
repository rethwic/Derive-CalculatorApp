import type { Category, CategoryId } from '../types';

// No per-category colors — one brand accent (--brand-color in index.css) is
// used everywhere. Categories differentiate by name/content, not by color.
export const categories: Category[] = [
  { id: 'algebra', name: 'Algebra & Precalculus', short: 'Algebra' },
  { id: 'geometry', name: 'Geometry & Trigonometry', short: 'Geometry' },
  { id: 'calculus', name: 'Calculus & Statistics', short: 'Calc & Stats' },
  { id: 'physics', name: 'Physics', short: 'Physics' },
  { id: 'chemistry', name: 'Chemistry', short: 'Chemistry' },
  { id: 'compsci', name: 'Computer Science', short: 'CS & Tech' },
];

export const categoryMap: Record<CategoryId, Category> = categories.reduce(
  (acc, c) => ({ ...acc, [c.id]: c }),
  {} as Record<CategoryId, Category>,
);
