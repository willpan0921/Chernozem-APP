// WHAT THIS FILE DOES
// The founder's letter on the About page, on the page's grid: its heading
// at the section size across the top, then the letter itself three
// columns in (the same line as the field row and "the record" above): the
// pin mark (there is no photograph of the founder and none is invented),
// five short paragraphs in the first person, the sign-off, and whatever
// the page adds under it (<Letter>...</Letter>: the line on what Chernozem
// was made for). The Story page links here as /#letter. Styles:
// src/site/pages/home.css (.letter).
//
// WHO EDITS IT
// The founder. It is his letter.

import { LOGO_SRC } from "../../components/ui/Logo.jsx";

const PARAGRAPHS = [
  "I grew up hearing about a meal my family almost did not have. My great-grandparents farmed black soil in northeastern China. A war went through their land and left it unusable, and for a time there was nothing to eat.",
  "One summer I stood on those fields. The soil was dark and alive again, but that had taken decades, and nobody at the time could have said where to start.",
  "When the war in Ukraine began I saw the same black earth in the news and the same question. I wrote a paper on where recovery should begin, ranking 24 oblasts from satellite data. With the partners I met at Penn, I turned it into this app, so that anyone could do it for their own land without writing a paper.",
  "Chernozem is honest by design. It never declares land safe. It shows its numbers, its sources and its limits, and it lets you change the weights yourself.",
  "If you farm, try Field. If you plan for many farms, try Atlas. Then tell me what is wrong with it; that is how it gets better.",
];

export default function Letter({ children }) {
  return (
    <div className="letter grid">
      <h2 id="letter-title" className="head letter-head" data-rise>
        A letter from the founder
      </h2>
      <div className="letter-text">
        <span className="letter-mark" data-rise style={{ "--i": 1 }} aria-hidden="true">
          <img src={LOGO_SRC} alt="" width="26" height="26" loading="lazy" decoding="async" />
        </span>
        <div className="letter-body">
          {PARAGRAPHS.map((text, i) => (
            <p key={text.slice(0, 24)} data-rise style={{ "--i": i + 2 }}>
              {text}
            </p>
          ))}
        </div>
        <p className="letter-sign" data-rise style={{ "--i": 7 }}>
          <em className="letter-name">William Pan</em>
          <span className="letter-role muted">Founder, Pasadena, California</span>
        </p>
        {children}
      </div>
    </div>
  );
}
