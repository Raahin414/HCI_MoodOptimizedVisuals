import { useEffect, useState } from 'react';
import { ArrowRight, Check, Expand, Grid2X2, LayoutList } from 'lucide-react';
import { Link } from 'react-router-dom';
import { VARIANTS, freshTasks, type VariantId } from './domain';
const colors = ['sage', 'sky', 'sand', 'sage', 'sky', 'sand', 'sage', 'sky'];
export function Thumbnail({ id }: { id: VariantId }) {
  return (
    <div className={'thumbnail tint-' + colors[Number(id.slice(-1)) - 1]} aria-hidden="true">
      <div className="mini-window">
        <div className="mini-window-bar">
          <span />
          <span />
          <span />
          <small>MoodSpace / {VARIANTS.find((v) => v.id === id)?.name}</small>
        </div>
        <img className="preview-image" src={'/previews/' + id + '.png'} alt="" loading="lazy" />
      </div>
    </div>
  );
}
export default function Gallery({
  order = VARIANTS.map((v) => v.id),
  onChoose,
  initial,
  final = false,
  tested = [],
}: {
  order?: VariantId[];
  onChoose?: (id: VariantId, viewed: VariantId[], reason: string) => void;
  initial?: VariantId;
  final?: boolean;
  tested?: VariantId[];
}) {
  const [selected, setSelected] = useState<VariantId | undefined>();
  const [viewed, setViewed] = useState<VariantId[]>([]);
  const [reason, setReason] = useState('');
  const [density, setDensity] = useState('all');
  const markViewed = (id: VariantId) => setViewed((a) => (a.includes(id) ? a : [...a, id]));
  useEffect(() => {
    if (!onChoose) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const id = (entry.target as HTMLElement).dataset.previewId as VariantId;
            setViewed((a) => (a.includes(id) ? a : [...a, id]));
          }
      },
      { threshold: 0.5 },
    );
    document.querySelectorAll('[data-preview-id]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [density, order.join(','), !!onChoose]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="context-label">The interface library</span>
          <h1>{final ? 'What fits you now?' : 'Eight ways to find your flow.'}</h1>
          <p>
            {onChoose
              ? final
                ? 'Choose freely from all eight designs. You can pick a preview you did not test.'
                : 'Browse all eight previews, then choose your first preference. Your study layouts will be assigned separately.'
              : 'The same courses. The same tasks. A different way to make space for them.'}
          </p>
        </div>
        <span className="library-count">
          08 <small>original layouts</small>
        </span>
      </div>
      <div className="gallery-toolbar">
        <div className="filter-tabs" aria-label="Filter interface density">
          {[
            ['all', 'All designs'],
            ['Low', 'Less at once'],
            ['Medium', 'A broader view'],
            ['High', 'Everything in view'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={density === id ? 'active' : ''}
              onClick={() => setDensity(id)}
            >
              {label}
              {id === 'all' && <span>8</span>}
            </button>
          ))}
        </div>
        <span className="muted toolbar-note">
          <Grid2X2 size={15} /> Same content, different structures
        </span>
      </div>
      <div className="gallery-grid">
        {order
          .filter(
            (id) => density === 'all' || VARIANTS.find((v) => v.id === id)?.density === density,
          )
          .map((id) => {
            const v = VARIANTS.find((v) => v.id === id)!;
            return (
              <article
                data-preview-id={id}
                className={'variant-card ' + (selected === id ? 'chosen' : '')}
                key={id}
              >
                <div className="preview-head">
                  <span>
                    {v.id} / {v.structure}
                  </span>
                  <span>
                    {final && tested.includes(id)
                      ? 'Tested in your session'
                      : v.density + ' density'}
                  </span>
                </div>
                <Thumbnail id={id} />
                <div className="variant-info">
                  <div>
                    <h2>{v.name}</h2>
                    <p>{v.description}</p>
                  </div>
                  {onChoose ? (
                    <button
                      className={selected === id ? 'selected-choice' : 'choose-button'}
                      onClick={() => {
                        setSelected(id);
                        markViewed(id);
                      }}
                      aria-pressed={selected === id}
                      aria-label={'Choose ' + v.name}
                    >
                      {selected === id ? <Check size={18} /> : <ArrowRight size={18} />}
                    </button>
                  ) : (
                    <Link
                      className="icon-link"
                      aria-label={'Try ' + v.name}
                      to={'/workspace/' + id}
                    >
                      <ArrowRight size={18} />
                    </Link>
                  )}
                </div>
                {onChoose && (
                  <details
                    className="preview-notes"
                    onToggle={(e) => {
                      if (e.currentTarget.open) markViewed(id);
                    }}
                  >
                    <summary>About this structure</summary>
                    <p>
                      {v.tag}.{' '}
                      {v.structure === 'Conversation'
                        ? 'A deterministic guide, with supported options and no remote AI.'
                        : 'Open tasks, check course progress, inspect deadlines, and complete work.'}
                    </p>
                  </details>
                )}
              </article>
            );
          })}
      </div>
      {onChoose ? (
        <div className="gallery-selection">
          <div>
            <h2>
              {selected
                ? VARIANTS.find((v) => v.id === selected)?.name
                : 'Make this workspace yours.'}
            </h2>
            <p>
              {final && initial
                ? 'Your first choice was ' + VARIANTS.find((v) => v.id === initial)?.name + '. '
                : ''}
              {selected
                ? tested.length && !tested.includes(selected)
                  ? 'This is a preview preference; you did not test this layout.'
                  : 'Your preference will be saved separately from your assigned layouts.'
                : 'Choose the structure you would most like to use.'}
            </p>
            <label>
              Why this one? <span className="muted">Optional</span>
              <textarea
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            </label>
          </div>
          <button
            className="primary"
            disabled={!selected}
            onClick={() => selected && onChoose(selected, viewed, reason)}
          >
            {final ? 'Save final preference' : 'Save first preference'}
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="gallery-footnote">
          <LayoutList size={18} />
          <p>No design is assigned to a mood. All eight are available in every mood context.</p>
          <Link to="/study">
            Take part in the study <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </>
  );
}
