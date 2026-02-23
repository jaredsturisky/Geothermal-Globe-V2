import React, { useState, useCallback, useEffect } from 'react';

const CONTENT = {
  audience: 'This site is for anyone exploring where geothermal energy potential is highest around the world.',
  sections: [
    {
      title: 'What this site is for',
      body: 'This globe helps you explore global geothermal potential and compare promising locations.',
    },
    {
      title: 'What data is shown',
      body: 'Each dot represents geothermal potential at a coordinate. Plate boundary lines are shown for context.',
    },
    {
      title: 'How locations are graded',
      body: 'Each point has a composite score from 0 to 1; higher means more promising.',
    },
    {
      title: 'Composite score, how it is calculated',
      body: 'The score is provided in the dataset and combines heat flow (mW/m²) and distance to the nearest plate boundary (km). Values are normalized before combining into a single 0–1 score. Higher heat flow and closer proximity to a boundary improve the score. This is an experimental indicator, not a guarantee of viability.',
    },
    {
      title: 'Feature guide',
      bullets: [
        'Threshold slider: sets the minimum score for “high potential” dots and the Top 20 list.',
        'Continent and Country filters: limit which dots, Top 20 entries, and compare candidates are shown.',
        'Top 20 list: shows the 20 highest-scoring sites in the current filtered set, sorted by score.',
        'Compare mode: pin two points as Slot A and B; the panel shows metrics and a winner summary (higher score wins; explanation uses heat flow and boundary distance).',
      ],
    },
  ],
};

const PANEL_STYLE = {
  position: 'absolute',
  background: 'rgba(8, 8, 18, 0.88)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  color: '#e0e0e0',
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  fontSize: 12,
};

export default function InfoModal() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label="About this site"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 20,
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(8, 8, 18, 0.75)',
          color: '#888',
          fontSize: 14,
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'inherit',
        }}
      >
        i
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="About this site"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'rgba(0,0,0,0.5)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            style={{
              ...PANEL_STYLE,
              maxWidth: 420,
              maxHeight: '85vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.09)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: 11, letterSpacing: 2 }}>ABOUT</span>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: '#666', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
              <p style={{ color: '#b0b0b0', fontSize: 12, margin: '0 0 16px', lineHeight: 1.5 }}>
                {CONTENT.audience}
              </p>
              {CONTENT.sections.map((sec, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <h3 style={{ color: '#f97316', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, margin: '0 0 6px' }}>
                    {sec.title}
                  </h3>
                  {sec.body && (
                    <p style={{ color: '#ddd', fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                      {sec.body}
                    </p>
                  )}
                  {sec.bullets && (
                    <ul style={{ margin: 0, paddingLeft: 18, color: '#ddd', fontSize: 11, lineHeight: 1.6 }}>
                      {sec.bullets.map((b, j) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
