// WHAT THIS FILE DOES
// The proof table the website shows twice (About, "Checked against the
// record"; Methodology, "Checks"): every check Chernozem's numbers have had
// against an independent record, as one real table with no lines, every
// second row on the surface tone. Under it, one line with the mean error.
// The numbers come from src/site/content/site.js, so they are never typed
// twice. Takes no props: <ProofTable />. Its styles are in src/site/site.css
// (.proof-*).
//
// WHO EDITS IT
// Whoever adds a new check. Add a row here and its number in site.js.

import { NUMBERS, formatInt } from "../content/site.js";

// year · what · compared with · result. "year" is printed as given, so the
// paper's row says "Paper" instead of a year.
const ROWS = [
  {
    year: "2023",
    what: "Thessaly flood, Greece",
    against: "Copernicus EMSR692",
    result: `${formatInt(NUMBERS.greeceFloodHa)} ha measured; ${NUMBERS.greeceFloodOfficial} ha official`,
  },
  {
    year: "2024",
    what: "Yambol wildfire, Bulgaria",
    against: "Copernicus EMSR738",
    result: `${formatInt(NUMBERS.bulgariaFireHa)} ha measured; ${formatInt(NUMBERS.bulgariaFireOfficial)} ha official`,
  },
  {
    year: "2025",
    what: "Punjab flood, Pakistan",
    against: "Copernicus EMSR838",
    result: `${formatInt(NUMBERS.pakistanFloodHa)} ha measured; ${formatInt(NUMBERS.pakistanFloodOfficial)} ha official (reads low)`,
  },
  {
    year: "2026",
    what: "Crop detection, North Dakota",
    against: "USDA Cropland Data Layer",
    result: `${NUMBERS.cropLikelyPercent}% right when it says “likely”; ${NUMBERS.cropHeldOutPercent}% over all six crops`,
  },
  {
    year: "Paper",
    what: "Damage against fighting, Ukraine",
    against: `ACLED, ${formatInt(NUMBERS.acledEvents)} events`,
    result: `rank correlation ${NUMBERS.acledCorrelation}`,
  },
];

export default function ProofTable() {
  return (
    <div className="proof">
      <table className="proof-table">
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">What</th>
            <th scope="col">Compared with</th>
            <th scope="col" className="proof-result">
              Result
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.what}>
              <td className="proof-year">{row.year}</td>
              <td className="proof-what">{row.what}</td>
              <td className="proof-against">{row.against}</td>
              <td className="proof-result">{row.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="proof-note">
        Mean error in area against the three Copernicus maps: {NUMBERS.mapePercent}%. Cropland wrongly flagged in a normal year: {NUMBERS.falseAlarmPercent}% at
        worst, {NUMBERS.falseAlarmMeanPercent}% on average.
      </p>
    </div>
  );
}
