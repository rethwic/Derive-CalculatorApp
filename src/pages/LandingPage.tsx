import { Link } from 'react-router-dom';
import { SymbolGrid } from '../components/SymbolGrid';
import { GlobalSearch } from '../components/GlobalSearch';
import { SubjectCard } from '../components/SubjectCard';
import { subjects } from '../data/subjects';

export function LandingPage() {
  return (
    <>
      <SymbolGrid />
      <div className="landing-page">
        <div className="landing-hero">
          <h1 className="landing-title">Derive</h1>
        </div>

        <div className="landing-search-group">
          <GlobalSearch />
          <div className="subject-grid">
            {subjects.map((s) => (
              <SubjectCard key={s.id} subject={s} />
            ))}
            <Link to="/workspace" className="subject-card glass">
              Workspace
            </Link>
          </div>
          <Link to="/contact" className="landing-contact-link">
            Have a recommendation? Get in touch →
          </Link>
        </div>
      </div>
    </>
  );
}
