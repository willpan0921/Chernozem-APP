// WHAT THIS FILE DOES
// The proof table the website shows twice (About, "Checked against the
// record"; Methodology, "Checks"): every check Chernozem's numbers have had
// against an independent record, as one real table with no lines, every
// second row on the surface tone. Under it, one line with the mean error.
// The numbers come from src/site/content/site.js, so they are never typed
// twice; each row's sentence has {holes} for them, filled where the table
// is drawn, so the numbers are written in the website's language (12 151
// in Ukrainian) and the sentence can be translated (src/site/i18n/,
// namespace "home"). Takes no props: <ProofTable />. Its styles are in
// src/site/site.css (.proof-*).
//
// WHO EDITS IT
// Whoever adds a new check. Add a row here and its number in site.js.

import { NUMBERS, formatInt } from "../content/site.js";
import { useT } from "../i18n/i18n.js";

// year · what · compared with · result. "year" is printed as given, so the
// paper's row says "Paper" instead of a year. "numbers" fills the holes of
// "against" and "result": a number is written in the website's language, a
// phrase from site.js ("12,600 to 15,000") is translated. A no-break space
// ( ) keeps "ha" on the line of its number; the dictionaries' keys have
// it too.
const ROWS = [
  {
    year: "2023",
    what: "Thessaly flood, Greece",
    against: "Copernicus EMSR692",
    result: "{measured} ha measured; {official} ha official",
    numbers: { measured: NUMBERS.greeceFloodHa, official: NUMBERS.greeceFloodOfficial },
  },
  {
    year: "2024",
    what: "Yambol wildfire, Bulgaria",
    against: "Copernicus EMSR738",
    result: "{measured} ha measured; {official} ha official",
    numbers: { measured: NUMBERS.bulgariaFireHa, official: NUMBERS.bulgariaFireOfficial },
  },
  {
    year: "2025",
    what: "Punjab flood, Pakistan",
    against: "Copernicus EMSR838",
    result: "{measured} ha measured; {official} ha official (reads low)",
    numbers: { measured: NUMBERS.pakistanFloodHa, official: NUMBERS.pakistanFloodOfficial },
  },
  {
    year: "2026",
    what: "Crop detection, North Dakota",
    against: "USDA Cropland Data Layer",
    result: "{likely}% right when it says “likely”; {all}% over all six crops",
    numbers: { likely: NUMBERS.cropLikelyPercent, all: NUMBERS.cropHeldOutPercent },
  },
  {
    year: "Paper",
    what: "Damage against fighting, Ukraine",
    against: "ACLED, {events} events",
    result: "rank correlation {rho}",
    numbers: { events: NUMBERS.acledEvents, rho: NUMBERS.acledCorrelation },
  },
];

export default function ProofTable() {
  const t = useT("home");
  // A row's holes, in the website's language.
  const fillings = (numbers) => Object.fromEntries(Object.entries(numbers).map(([name, value]) => [name, typeof value === "number" ? formatInt(value) : t(value)]));
  return (
    <div className="proof">
      <table className="proof-table">
        <thead>
          <tr>
            <th scope="col">{t("Year")}</th>
            <th scope="col">{t("What")}</th>
            <th scope="col">{t("Compared with")}</th>
            <th scope="col" className="proof-result">
              {t("Result")}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const vars = fillings(row.numbers);
            return (
              <tr key={row.what}>
                <td className="proof-year">{t(row.year)}</td>
                <td className="proof-what">{t(row.what)}</td>
                <td className="proof-against">{t(row.against, vars)}</td>
                <td className="proof-result">{t(row.result, vars)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="proof-note">
        {t("Mean error in area against the three Copernicus maps: {mape}%. Cropland wrongly flagged in a normal year: {worst}% at worst, {mean}% on average.", {
          mape: formatInt(NUMBERS.mapePercent),
          worst: formatInt(NUMBERS.falseAlarmPercent),
          mean: formatInt(NUMBERS.falseAlarmMeanPercent),
        })}
      </p>
    </div>
  );
}
