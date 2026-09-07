import { useState } from 'react';
import { Link } from 'react-router-dom';

const CONTACT_EMAIL = 'rethwicknagarajan@gmail.com';

type Topic = 'recommendation' | 'bug' | 'other';

const TOPIC_LABELS: Record<Topic, string> = {
  recommendation: 'Recommendation',
  bug: 'Something broken',
  other: 'Other',
};

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 18h6M10 21h4M8 14.5A5.5 5.5 0 1116 14.5c-.9.9-1.5 1.7-1.5 3H9.5c0-1.3-.6-2.1-1.5-3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 005.4-5.4l-2.6 2.6-2-2 2.6-2.6z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5h16v10H8l-4 4V5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20l17-8L4 4l0 6.5L15 12 4 13.5 4 20z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

const TOPIC_ICONS: Record<Topic, React.ReactNode> = {
  recommendation: <LightbulbIcon />,
  bug: <WrenchIcon />,
  other: <ChatIcon />,
};

// The site has no backend to receive a submission, so "sending" a message
// means handing off to Gmail's own web compose window instead — opened
// with the recipient/subject/body already filled in, rather than silently
// posting somewhere. This is Gmail-specific (a mailto: link would instead
// prompt whatever mail client/handler the visitor's OS or browser has
// configured, which is a much less predictable experience than opening
// a draft directly). URLSearchParams handles the encoding, newlines
// included, without needing to build the query string by hand.
function buildGmailComposeUrl(topic: Topic, name: string, email: string, message: string): string {
  const subject = `Derive feedback: ${TOPIC_LABELS[topic]}`;
  const bodyLines = [message.trim(), '', name.trim() ? `— ${name.trim()}` : '', email.trim() ? email.trim() : ''];
  const body = bodyLines.join('\n').trim();
  const params = new URLSearchParams({ view: 'cm', fs: '1', to: CONTACT_EMAIL, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function ContactPage() {
  const [topic, setTopic] = useState<Topic>('recommendation');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const canSend = message.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    // A new tab, not window.location — this is a real page navigation (to
    // mail.google.com) rather than a protocol handoff like mailto: was, so
    // sending you there directly would navigate you away from Derive
    // rather than just opening something alongside it.
    window.open(buildGmailComposeUrl(topic, name, email, message), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="contact-page">
      <Link to="/" className="contact-back glass">
        ← Derive
      </Link>

      <div className="contact-hero">
        <div className="contact-hero-icon">
          <MailIcon />
        </div>
        <h1>Contact &amp; recommendations</h1>
        <p>Spot something wrong, or have an idea that would make Derive better? I'd like to hear it.</p>
      </div>

      <form className="contact-form glass" onSubmit={handleSubmit}>
        <div className="contact-field">
          <span className="contact-label">What's this about?</span>
          <div className="contact-topic-group">
            {(Object.keys(TOPIC_LABELS) as Topic[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`contact-topic-btn${topic === t ? ' contact-topic-btn-active' : ''}`}
                onClick={() => setTopic(t)}
              >
                {TOPIC_ICONS[t]}
                <span>{TOPIC_LABELS[t]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="contact-field-row">
          <label className="contact-field">
            <span className="contact-label">Name (optional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
            />
          </label>
          <label className="contact-field">
            <span className="contact-label">Email (optional, if you'd like a reply)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
        </div>

        <label className="contact-field">
          <span className="contact-label">Message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What would make Derive more useful for you?"
            rows={6}
            required
          />
        </label>

        <div className="contact-submit-row">
          <button type="submit" className="contact-submit" disabled={!canSend}>
            <SendIcon />
            Open draft in Gmail
          </button>
          <span className="contact-submit-hint">
            <InfoIcon />
            Derive doesn't have a server of its own — this opens a pre-filled draft to {CONTACT_EMAIL} in a new Gmail
            tab. Nothing is sent until you hit Send there.
          </span>
        </div>
      </form>
    </div>
  );
}
