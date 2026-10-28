// WHAT THIS FILE DOES
// The founder's letter on the About page: a centred column, the pin mark
// at the top-left (there is no photograph of the founder and none is
// invented), five short paragraphs in the first person, and the sign-off.
// The Story page links here as /#letter. Styles: src/site/pages/home.css
// (.letter).
//
// WHO EDITS IT
// The founder. It is his letter.

import { LOGO_SRC } from "../../components/ui/Logo.jsx";

const PARAGRAPHS = [
  "I grew up hearing about a meal my family almost did not have. My great-grandparents farmed black soil in northeastern China. A war went through their land and left it unusable, and for a time there was nothing to eat.",
  "One summer I stood on those fields. The soil was dark and alive again, but that had taken decades, and nobody at the time could have said where to start.",
  "When the war in Ukraine began I saw the same black earth in the news and the same question. I wrote a paper on where recovery should begin, ranking 24 oblasts from satellite data. Then I built this app, so that anyone could do it for their own land without writing a paper.",
  "Chernozem is honest by design. It never declares land safe. It shows its numbers, its sources and its limits, and it lets you change the weights yourself.",
  "If you farm, try Field. If you plan for many farms, try Atlas. Then tell me what is wrong with it; that is how it gets better.",
];

export default function Letter() {
  return (
    <div className="letter">
      <h2 className="letter-head" data-rise>
        A letter from the founder
      </h2>
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
    </div>
  );
}
