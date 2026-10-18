// WHAT THIS FILE DOES
// The Notes page of the Field product (/field/notes): a list of scouting
// notes on the left and the open note on the right. The search box and the
// category pills filter the list; clicking a note card opens it.
//
// The notes come from Firestore through src/api/notesApi.js. The page's own
// words come from src/data/farm.js (notesPage). "New note" swaps the open
// note for a form that saves a new note to Firestore. The little pictures (leaf, beetle, crater, sunflowers,
// the small satellite map) are drawn by hand further down in this file.
//
// WHO EDITS IT
// Whoever changes how the Notes page looks or behaves. To change a note's
// text, edit src/data/farm.js instead. Styling lives in NotesPage.css.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Plus, Pencil, Focus, Droplet, Sprout, Bug, Shield, Wheat, Image } from "lucide-react";
import { PageHeader, Card, Badge, Button, Tabs, ChipSelect } from "../../components/ui/index.js";
import { notesPage, noteCategoryStyles, fieldOptions } from "../../data/farm.js";
import { listenToNotes, noteCategoriesFor, addNote } from "../../api/notesApi.js";
import "./NotesPage.css";

// TODO move to src/data/farm.js — the mockup colours the categories
// differently from noteCategoryStyles (Pests is green, Water is plain grey)
// and the pale no-photo square needs its own colour ("thumbTone"). Until the
// data file carries both, this record overrides it. Once farm.js is updated
// (Pests.tone = "green", Water.tone = null, plus a thumbTone on each entry),
// delete this const and categoryStyle() will read the data file alone.
const categoryOverrides = {
  Pests: { tone: "green", thumbTone: "green" },
  Damage: { tone: "red", thumbTone: "green" },
  Harvest: { tone: "green", thumbTone: "green" },
  Water: { tone: null, thumbTone: "blue" },
  Soil: { tone: "green", thumbTone: "green" },
};

// Everything the page needs to know about one category's look: the pill
// tone, the pale square's tone and the icon key. Data file first, then the
// overrides above on top.
function categoryStyle(category) {
  return { ...noteCategoryStyles[category], ...categoryOverrides[category] };
}

// The Lucide icon drawn in the pale square when a note has no photo. The
// key comes from categoryStyle(category).icon.
const categoryIcons = { bug: Bug, shield: Shield, wheat: Wheat, droplet: Droplet, sprout: Sprout };

export default function NotesPage() {
  // The notes from Firestore, and whether they are still loading ("loading",
  // "ready" or "error").
  const [notes, setNotes] = useState([]);
  const [status, setStatus] = useState("loading");

  // Listen to Firestore while the page is open; stop when it closes.
  useEffect(
    () =>
      listenToNotes(
        (latest) => {
          setNotes(latest);
          setStatus("ready");
        },
        (error) => {
          console.error("[notes] Could not load notes:", error);
          setStatus("error");
        }
      ),
    []
  );

  // Which category pill is lit, what is typed in the search box, and which
  // note is open on the right.
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  // True while the New note form is open on the right.
  const [writing, setWriting] = useState(false);

  // After a save: clear the filters so the new note is in the list, close
  // the form and open the new note.
  function handleSaved(id) {
    setCategory("all");
    setQuery("");
    setSelectedId(id);
    setWriting(false);
  }

  // The notes that pass both filters.
  const words = query.trim().toLowerCase();
  const visible = notes.filter((note) => {
    const inCategory = category === "all" || note.category === category;
    const inSearch =
      !words || note.title.toLowerCase().includes(words) || note.summary.toLowerCase().includes(words);
    return inCategory && inSearch;
  });

  // The open note. If a filter hid it, show the first visible one instead.
  const selected = visible.find((note) => note.id === selectedId) || visible[0] || null;

  return (
    <div className="page fn-page">
      <PageHeader
        title={notesPage.title}
        subtitle={notesPage.subtitle}
        actions={
          <>
            <label className="fn-search">
              <Search size={16} />
              <input
                type="search"
                className="input"
                placeholder={notesPage.searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={notesPage.searchPlaceholder}
              />
            </label>
            <Button variant="primary" size="lg" icon={<Plus size={16} />} onClick={() => setWriting(true)}>
              {notesPage.newNote}
            </Button>
          </>
        }
      />

      <Tabs tabs={noteCategoriesFor(notes)} active={category} onChange={setCategory} ariaLabel="Note categories" />

      <div className="fn-columns">
        {/* LEFT: the list of notes. */}
        <div className="fn-list" role="list">
          {visible.map((note) => (
            <div role="listitem" key={note.id}>
              <NoteCard
                note={note}
                selected={selected?.id === note.id}
                onClick={() => {
                  setSelectedId(note.id);
                  setWriting(false);
                }}
              />
            </div>
          ))}
          {visible.length === 0 && <p className="fn-empty muted small">{emptyMessage(status, notes)}</p>}
        </div>

        {/* RIGHT: the New note form, or the open note. */}
        {writing ? (
          <NewNoteForm onSaved={handleSaved} onCancel={() => setWriting(false)} />
        ) : selected ? (
          <NoteDetail note={selected} />
        ) : (
          <Card className="fn-detail" />
        )}
      </div>
    </div>
  );
}

// What the list says when it shows no notes.
function emptyMessage(status, notes) {
  if (status === "loading") return "Loading notes…";
  if (status === "error") return "Could not load notes. Check your connection and refresh.";
  if (notes.length === 0) return "No notes yet.";
  return "No notes match.";
}

/* -------------------------------------------------------------------------
   One card in the list on the left.
   ------------------------------------------------------------------------- */

function NoteCard({ note, selected, onClick }) {
  return (
    <button
      type="button"
      className={selected ? "fn-note is-selected" : "fn-note"}
      onClick={onClick}
      aria-pressed={selected}
    >
      <Thumb note={note} />
      <div className="fn-note-text">
        <div className="fn-note-meta">
          <Badge tone={categoryStyle(note.category).tone}>{note.category}</Badge>
          <span className="muted small">
            {note.fieldName} · {note.dateDisplay}
          </span>
        </div>
        <span className="fn-note-title">{note.title}</span>
        <span className="fn-note-summary">{note.summary}</span>
        {(note.photoCount > 0 || note.flag) && (
          <div className="fn-note-footer">
            {note.photoCount > 0 && <span className="muted small">{note.photoCountDisplay}</span>}
            {note.flag && <span className="fn-flag">{note.flag}</span>}
          </div>
        )}
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------
   The New note form on the right. Save stays off until a category and a
   title are filled in.
   ------------------------------------------------------------------------- */

const categoryNames = Object.keys(noteCategoryStyles);

function NewNoteForm({ onSaved, onCancel }) {
  const words = notesPage.newNoteForm;
  const [fieldId, setFieldId] = useState(fieldOptions[0]?.value);
  const [category, setCategory] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // "idle", "saving" or "error".
  const [saveStatus, setSaveStatus] = useState("idle");

  const canSave = category && title.trim() && saveStatus !== "saving";

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSave) return;
    setSaveStatus("saving");
    try {
      const id = await addNote({ fieldId, category, title, body });
      onSaved(id);
    } catch (error) {
      console.error("[notes] Could not save the note:", error);
      setSaveStatus("error");
    }
  }

  return (
    <Card className="fn-detail" title={words.title} subtitle={words.subtitle}>
      <form className="stack fn-form" onSubmit={handleSubmit}>
        <div>
          <span className="field-label">{words.fieldLabel}</span>
          <ChipSelect options={fieldOptions} value={fieldId} onChange={setFieldId} ariaLabel={words.fieldLabel} />
        </div>

        <div>
          <span className="field-label">{words.categoryLabel}</span>
          <Tabs
            tabs={categoryNames.map((name) => ({ id: name, label: name }))}
            active={category}
            onChange={setCategory}
            ariaLabel={words.categoryLabel}
          />
        </div>

        <label>
          <span className="field-label">{words.titleLabel}</span>
          <input
            className="input"
            placeholder={words.titlePlaceholder}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label>
          <span className="field-label">{words.bodyLabel}</span>
          <textarea
            className="textarea"
            placeholder={words.bodyPlaceholder}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={5}
          />
        </label>

        {saveStatus === "error" && <p className="fn-form-error small">{words.error}</p>}

        <div className="cluster fn-form-actions">
          <Button onClick={onCancel}>{words.cancel}</Button>
          <Button variant="primary" type="submit" disabled={!canSave}>
            {saveStatus === "saving" ? words.saving : words.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* -------------------------------------------------------------------------
   The open note on the right.
   ------------------------------------------------------------------------- */

function NoteDetail({ note }) {
  const style = categoryStyle(note.category);
  const Icon = categoryIcons[style.icon] || Image;
  return (
    <Card className="fn-detail">
      {/* Top row: category, field, crop, date on the left; Edit on the right. */}
      <div className="fn-detail-top">
        <div className="fn-detail-meta">
          <Badge tone={style.tone}>{note.category}</Badge>
          <Link to="/field/fields" className="fn-field-link">
            {note.fieldName} · {note.fieldCrop}
          </Link>
          <span className="muted small">{note.fullDateDisplay}</span>
        </div>
        <Button icon={<Pencil size={14} />} title="Not connected yet">
          {notesPage.edit}
        </Button>
      </div>

      <h2 className="fn-detail-title">{note.fullTitle}</h2>

      {/* The photos, or a pale placeholder when the note has none. */}
      {note.photos.length > 0 ? (
        <div className="fn-photos">
          {note.photos.map((kind, index) => (
            <div className="fn-photo" key={`${kind}-${index}`}>
              <Photo kind={kind} />
            </div>
          ))}
        </div>
      ) : (
        <div className="fn-photos fn-photos-empty">
          <div className="fn-photo fn-photo-placeholder">
            <Icon size={22} />
            <span className="small">No photos with this note</span>
          </div>
        </div>
      )}

      <p className="fn-body">{note.body}</p>

      {/* What the satellite saw: a small map plus the text and two buttons.
          Hidden when the note has nothing from the satellite. */}
      {note.satelliteNote && (
        <div className="fn-satellite">
          <div className="fn-satellite-map">
            <SatelliteMap pin={note.satelliteNote.pin} />
          </div>
          <div className="fn-satellite-text">
            <h3 className="fn-satellite-title">
              <Focus size={14} />
              {notesPage.satelliteTitle}
            </h3>
            <p>{note.satelliteNote.text}</p>
            <p className="muted small">{note.satelliteNote.caveat}</p>
            <div className="cluster fn-satellite-actions">
              <Button variant="primary" to="/field/ai">
                {notesPage.askAi}
              </Button>
              <Button title="Not connected yet">{notesPage.share}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Footer facts: where, how, and tags. Each one hides when empty. */}
      <dl className="fn-meta">
        {note.location && (
          <div>
            <dt>{notesPage.metaLabels.location}</dt>
            <dd className="mono">{note.location}</dd>
          </div>
        )}
        {note.addedFrom && (
          <div>
            <dt>{notesPage.metaLabels.addedFrom}</dt>
            <dd>{note.addedFrom}</dd>
          </div>
        )}
        {note.tags.length > 0 && (
          <div>
            <dt>{notesPage.metaLabels.tags}</dt>
            <dd className="cluster">
              {note.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </Card>
  );
}

/* -------------------------------------------------------------------------
   The small square picture on each list card. Notes with photos get a
   little drawing; the others get an icon on a pale square.
   ------------------------------------------------------------------------- */

function Thumb({ note }) {
  if (note.thumb === "leaf") {
    return (
      <svg className="fn-thumb" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" fill="var(--c-scale-5)" />
        <path d="M10 54 C 14 30, 36 10, 56 10 C 54 34, 34 54, 10 54 Z" fill="var(--c-scale-3)" />
        <path d="M12 52 L54 12" stroke="var(--c-scale-2)" strokeWidth="1.4" />
        <circle cx="26" cy="38" r="3" fill="var(--c-ink)" />
        <circle cx="36" cy="30" r="2.6" fill="var(--c-ink)" />
        <circle cx="30" cy="26" r="1.8" fill="var(--c-ink)" />
      </svg>
    );
  }
  if (note.thumb === "crater") {
    return (
      <svg className="fn-thumb" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" fill="#6f6a48" />
        <rect y="0" width="64" height="10" fill="var(--c-scale-5)" />
        <circle cx="32" cy="36" r="13" fill="#4a4631" />
        <circle cx="32" cy="36" r="8" fill="var(--c-ink)" />
        <circle cx="32" cy="36" r="3.5" fill="#8a8362" />
      </svg>
    );
  }
  if (note.thumb === "sunflowers") {
    return (
      <svg className="fn-thumb" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" fill="#8a8a4a" />
        <rect y="46" width="64" height="18" fill="#6b6b35" />
        <path d="M22 48 V34 M42 48 V34" stroke="var(--c-scale-4)" strokeWidth="2.5" />
        <circle cx="22" cy="28" r="9" fill="var(--c-field-harvest)" />
        <circle cx="42" cy="28" r="9" fill="var(--c-field-harvest)" />
        <circle cx="22" cy="28" r="5.5" fill="#5a3b1e" />
        <circle cx="42" cy="28" r="5.5" fill="#5a3b1e" />
      </svg>
    );
  }
  // No photo: an icon on a pale square whose colour comes from the
  // category's style record (thumbTone), with green as the safety net.
  const style = categoryStyle(note.category);
  const Icon = categoryIcons[style.icon] || Image;
  const tone = style.thumbTone || "green";
  return (
    <span className={`fn-thumb fn-thumb-icon fn-thumb-${tone}`} aria-hidden="true">
      <Icon size={20} strokeWidth={1.8} />
    </span>
  );
}

/* -------------------------------------------------------------------------
   The wide photo illustrations in the open note. Each is a simple drawing
   in a 200 x 100 box. Specific shades are typed in here on purpose, since
   the pictures need colours the design tokens do not have.
   ------------------------------------------------------------------------- */

function Photo({ kind }) {
  if (kind === "leaf") {
    return (
      <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="200" height="100" fill="var(--c-scale-5)" />
        {/* The leaf: a mid-green blade with a pale centre vein and side veins. */}
        <path d="M22 82 C 40 30, 140 6, 178 18 C 168 58, 86 98, 22 82 Z" fill="#7fa663" />
        <path d="M26 80 L174 22" stroke="#b7d39c" strokeWidth="2.2" />
        <path
          d="M56 70 L68 42 M78 64 L92 34 M100 56 L114 28 M122 48 L136 22 M144 40 L156 18 M70 72 L96 60 M96 64 L122 52 M122 56 L146 46"
          stroke="#b7d39c"
          strokeWidth="1.1"
          opacity="0.8"
        />
        {/* Holes the beetles chewed. */}
        <circle cx="76" cy="58" r="4.2" fill="var(--c-ink)" />
        <circle cx="104" cy="50" r="4.8" fill="var(--c-ink)" />
        <circle cx="128" cy="44" r="3.2" fill="var(--c-ink)" />
        <circle cx="90" cy="70" r="2.6" fill="var(--c-ink)" />
        <circle cx="150" cy="30" r="2.4" fill="var(--c-ink)" />
        {/* Pale spots where the leaf is drying. */}
        <circle cx="88" cy="42" r="2.6" fill="#e3ead0" />
        <circle cx="116" cy="60" r="2.3" fill="#e3ead0" />
        <circle cx="140" cy="36" r="2.1" fill="#e3ead0" />
        <circle cx="62" cy="64" r="1.9" fill="#e3ead0" />
        <circle cx="134" cy="56" r="1.7" fill="#e3ead0" />
      </svg>
    );
  }
  if (kind === "beetle") {
    return (
      <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="200" height="100" fill="#5f7a44" />
        <path d="M0 30 C 60 10, 140 50, 200 30" stroke="#86a06a" strokeWidth="2.5" fill="none" />
        <path d="M0 75 C 60 55, 140 95, 200 75" stroke="#86a06a" strokeWidth="2.5" fill="none" />
        <g stroke="var(--c-ink)" strokeWidth="3" strokeLinecap="round">
          <path d="M82 52 L62 40 M82 62 L58 64 M86 72 L68 88" />
          <path d="M118 52 L138 40 M118 62 L142 64 M114 72 L132 88" />
          <path d="M92 36 L84 22 M108 36 L116 22" strokeWidth="2" />
        </g>
        {/* The beetle: a dark head and a rounded body with a lighter top half
            and a thin line down the middle of its wing cases. */}
        <circle cx="100" cy="38" r="10" fill="var(--c-ink)" />
        <ellipse cx="100" cy="62" rx="20" ry="18" fill="var(--c-ink)" />
        <path d="M82 58 A 20 18 0 0 1 118 58 L118 62 L82 62 Z" fill="#3a3a35" />
        <path d="M100 48 V80" stroke="#4a4a44" strokeWidth="1.4" />
        <ellipse cx="94" cy="54" rx="4" ry="2.5" fill="#55554e" />
        <ellipse cx="106" cy="54" rx="4" ry="2.5" fill="#55554e" />
      </svg>
    );
  }
  if (kind === "sunflowers") {
    return (
      <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {/* A pale sky, a dark tree line on the horizon, then the field. */}
        <rect width="200" height="100" fill="#c9d0c4" />
        <rect width="200" height="22" fill="#d8ded3" />
        <path d="M0 30 C 40 10, 80 30, 120 18 C 150 10, 180 25, 200 20 L200 48 L0 48 Z" fill="var(--c-scale-5)" />
        <rect y="46" width="200" height="54" fill="#8a8a4a" />
        {[18, 50, 82, 114, 146, 178].map((x) => (
          <g key={x}>
            <path d={`M${x} 95 V62`} stroke="var(--c-scale-4)" strokeWidth="2.2" />
            <circle cx={x} cy="60" r="7" fill="var(--c-field-harvest)" />
            <circle cx={x} cy="60" r="4.5" fill="#5a3b1e" />
          </g>
        ))}
        {[6, 36, 68, 100, 132, 164, 196].map((x) => (
          <g key={x}>
            <path d={`M${x} 100 V84`} stroke="var(--c-scale-4)" strokeWidth="2.8" />
            <circle cx={x} cy="82" r="10" fill="var(--c-field-harvest)" />
            <circle cx={x} cy="82" r="6.5" fill="#5a3b1e" />
          </g>
        ))}
      </svg>
    );
  }
  if (kind === "crater") {
    return (
      <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="200" height="100" fill="#6f6a48" />
        <path d="M0 22 C 40 8, 90 26, 130 14 C 160 6, 185 18, 200 12 L200 30 L0 30 Z" fill="var(--c-scale-5)" />
        <ellipse cx="100" cy="64" rx="42" ry="22" fill="#4a4631" />
        <ellipse cx="100" cy="64" rx="26" ry="13" fill="var(--c-ink)" />
        <ellipse cx="100" cy="64" rx="9" ry="4.5" fill="#8a8362" />
      </svg>
    );
  }
  return null;
}

/* -------------------------------------------------------------------------
   The small map in "What the satellite saw": a green field inside a dark
   frame, a dashed circle around the spot and a pin. "pin" is where the note
   was taken, as fractions of the field from 0 to 1.
   ------------------------------------------------------------------------- */

function SatelliteMap({ pin }) {
  // The field is drawn as a slightly tilted rectangle from (14,12) to (174,118).
  const x = 20 + pin.x * 150;
  const y = 18 + pin.y * 96;
  return (
    <svg viewBox="0 0 190 130" aria-hidden="true">
      <rect width="190" height="130" rx="6" fill="#4a4631" />
      <path d="M14 14 L176 10 L174 118 L16 122 Z" fill="var(--c-field-watch)" />
      <path d="M16 122 C 30 70, 80 60, 110 118 Z" fill="var(--c-scale-3)" />
      <circle cx={x} cy={y} r="22" fill="none" stroke="var(--c-ink)" strokeWidth="1.6" strokeDasharray="4 3" />
      <path
        d={`M${x} ${y + 6} C ${x - 9} ${y - 6}, ${x - 9} ${y - 18}, ${x} ${y - 18} C ${x + 9} ${y - 18}, ${x + 9} ${y - 6}, ${x} ${y + 6} Z`}
        fill="var(--c-ink)"
      />
      <circle cx={x} cy={y - 10} r="3.5" fill="var(--c-amber)" />
    </svg>
  );
}
