import type { Subject, SubjectId } from '../types';

// No per-subject colors — one brand accent (--brand-color in index.css) is
// used everywhere. Subjects differentiate by name/content, not by color.
export const subjects: Subject[] = [
  {
    id: 'math',
    name: 'Math',
    tagline: 'Algebra, geometry, calculus & statistics',
    categories: ['algebra', 'geometry', 'calculus'],
  },
  {
    id: 'science',
    name: 'Science',
    tagline: 'Physics & chemistry',
    categories: ['physics', 'chemistry'],
  },
  {
    id: 'tech',
    name: 'Tech',
    tagline: 'Computer science',
    categories: ['compsci'],
  },
];

export const subjectMap: Record<SubjectId, Subject> = subjects.reduce(
  (acc, s) => ({ ...acc, [s.id]: s }),
  {} as Record<SubjectId, Subject>,
);
