import { Link } from 'react-router-dom';
import type { Subject } from '../types';

export function SubjectCard({ subject }: { subject: Subject }) {
  return (
    <Link to={`/${subject.id}`} className="subject-card glass">
      {subject.name}
    </Link>
  );
}
