// WHAT THIS FILE DOES
// The wars the app knows about. Chernozem works anywhere on Earth; most of
// the world is at peace, and there "damage" simply means unusual fire or
// disturbance compared with the normal years 2019 to 2021, from any cause.
// Where an area lies in one of the countries below (and, for a war with
// boxes, inside one of its boxes), damage is counted from the day that war
// started, and the Field's Data page marks that day on its charts.
//
//   id         short name used in the data
//   name       how the app writes it
//   since      the day it started ("YYYY-MM-DD")
//   countries  numeric ISO 3166 codes (as text) of the countries it covers
//              (the ids of the app's map, world-atlas / Natural Earth 1:50m)
//   areas      optional boxes [west, south, east, north] (degrees): when
//              given, the war covers only the parts of its countries inside
//              one of these boxes (the Gaza war covers the Gaza Strip, not
//              the West Bank). A war with areas and no countries covers
//              the boxes whatever the country.
//
// The normal years (2019 to 2021) must be BEFORE the war started, so only
// wars that began in 2022 or later belong here. The checkers preferred
// places where 2019 to 2021 were mostly calm; where the place already had
// fighting then, the entry's comment names it as a caveat (Amhara in late
// 2021, the Donbas front line, Gaza in May 2021...): the normal years there
// already hold some damage, so fire damage reads smaller than it is and
// radar change is less reliable (docs/METHODS.md, "Wars").
//
// The wars added on 2026-10-19 have their sources in a comment above them,
// with the day they were checked (by two checkers each). Wars change:
// re-check the list (still going? new fronts? the boxes?) every few
// months; docs/METHODS.md, "Wars".
//
// THE TEAM'S OWN CHOICE: any Atlas area can be marked by its team in Atlas
// Settings (saved as area.war; checkAreaWar and teamConflict below): "App's
// list" (use this list; the default), "At war" from a day of their choice
// (2022-01-01 to today), or "Not at war" whatever this list says.
// server/conflicts.js conflictForArea uses that choice first. A month that
// ends before its war began has no war damage counted (endsBeforeWar).
//
// LIMITS: a war is matched by COUNTRY (and its boxes) only, and an area has
// one war: a drawn area with any of its land in a war counts as at war all
// over. A whole-country area of a country that holds a war limited to boxes
// (Russia, DR Congo, Ethiopia, Israel, Lebanon, South Sudan, Thailand,
// Cambodia, and Palestine for the Gaza war) keeps the war's start day, but
// its rules apply only in the squares that touch the boxes (warSquares
// below; run.conflict.partOfCountry, with each square's atWar); the other
// squares are read at peace rules, with their distance to fighting
// measured to unusual fires inside the boxes. The Overview's chip, the
// report and the AI say so. For numbers on the war's region alone, add it
// (or draw it) as its own area. A war not listed
// here counts as peace: damage there is still found from unusual fire and
// radar change, but nothing is measured as distance to fighting, and that
// does not mean the land is safe. Left out on purpose (checked 2026-10-19):
// Myanmar (the 2021 coup makes 2021 a war year), the Sahel, Yemen and Syria
// (at war through 2019 to 2021), the 2026 war in Tigray and Afar (the
// battlefield of 2020 to 2022), the air wars over Iran and the
// Pakistan-Afghanistan clashes (no farmland front), and criminal violence
// (Haiti, Mexico). For any of them the team can mark an area "At war" from
// a day of its choice in Atlas Settings.
//
// WHO EDITS IT
// Whoever adds a war. Add an entry with its sources; nothing else needs to
// change. Add a test with a point inside and one outside its boxes
// (server/conflicts.test.js), and its line in docs/METHODS.md ("Wars").

export const CONFLICTS = [
  // Caveat: the Donbas front line (Donetsk and Luhansk oblasts) was fought
  // over from 2014 to February 2022 (shelling, mines, abandoned fields), so
  // 2019 to 2021 are not normal years there. (Listed before 2026-10-19; the
  // caveats on this entry and the two below were added in review, not by
  // the 2026-10-19 check.)
  { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24", countries: ["804"] },
  // Caveat: Darfur had its own fighting in 2019 to 2021 (Jebel Marra; the
  // attacks around El Geneina, West Darfur, in 2021), so 2019 to 2021 are
  // not normal years there.
  { id: "sudan-2023", name: "War in Sudan", since: "2023-04-15", countries: ["729"] },
  // Caveat: the 11-day war of 10-21 May 2021 hit the whole Strip, so 2021
  // is not a normal year there.
  { id: "gaza-2023", name: "Gaza war", since: "2023-10-07", countries: ["275"], areas: [[34.2, 31.2, 34.6, 31.6]] },

  // Russia's Kursk and Belgorod border areas: part of the Russia-Ukraine war
  // (24 Feb 2022). Belgorod's border villages shelled from 23-24 Mar 2022,
  // Kursk's border posts from Apr-May 2022; raids into Belgorod (May-Jun
  // 2023) and Belgorod and Kursk (12 Mar-7 Apr 2024); Ukraine's ground
  // incursion into Kursk near Sudzha from 6 Aug 2024 (Russia said on 26 Apr
  // 2025 it had retaken all of it); attacks into Belgorod's Krasnaya Yaruga
  // district from 18 Mar 2025. Shelling, drones, missiles and mines go on in
  // 2026, with no ceasefire (Oct 2026). Kursk's governor: harvest not
  // completed on 160,000 ha after the incursion; about 170,000 ha demined by
  // Jun 2026 (Russian official claims). A separate entry from Ukraine's,
  // because a war's boxes limit all of its countries.
  // Boxes: the Kursk incursion districts (Glushkovo and Tyotkino, Korenevo,
  // Sudzha, Bolshesoldatsky, western Belovsky, the south of Rylsk and Lgov);
  // Belgorod's Krasnaya Yaruga-Graivoron border (Demidovka, Popovka); the
  // strip from Graivoron through Belgorod city to Shebekino. Left out: the
  // border east of Shebekino (Volokonovka, Valuyki).
  // Sources:
  //   https://aapnews.aap.com.au/news/ukraine-pierces-russian-border-triggers-fierce-clashes (Reuters, Aug 2024: the Kursk incursion from 6 Aug 2024)
  //   https://www.aljazeera.com/news/2025/4/26/russia-says-it-has-fully-retaken-kursk-but-ukraine-says-fighting-continues
  //   https://www.agcanada.com/?p=147672 (Reuters, 17 Oct 2024: 160,000 ha not harvested; a separate drought emergency)
  //   https://www.bostonglobe.com/2025/07/12/world/landscape-death-whats-left-where-ukraine-invaded-russia/ (NYT: cratered villages, mines around Sudzha)
  //   https://www.prensa-latina.cu/2026/06/04/finalizan-labores-de-desminado-de-la-provincia-rusa-de-kursk/ (4 Jun 2026: about 170,000 ha demined)
  //   https://novayagazeta.eu/en/articles/2026/07/07/practically-impossible-en (mines and UXO in Kursk and Belgorod)
  //   https://caliber.az/en/post/russia-s-belgorod-sees-tripling-of-civilian-casualties-amid-ukrainian-attacks (TASS, 19 Mar 2026: 68 border settlements evacuated)
  //   https://meduza.io/en/news/2023/06/02/belgorod-governor-850-projectiles-hit-shebekino-municipality-in-24-hours
  //   https://en.wikipedia.org/wiki/Attacks_in_Russia_during_the_Russian_invasion_of_Ukraine (2022 shelling; Demidovka, Mar 2025)
  //   https://en.wikipedia.org/wiki/2023_Belgorod_Oblast_incursions
  //   https://en.wikipedia.org/wiki/March_2024_western_Russia_incursion
  //   https://en.wikipedia.org/wiki/Kursk_campaign
  //   https://en.wikipedia.org/wiki/Timeline_of_the_Russo-Ukrainian_war_(1_June_2026_–_present) (strikes on Belgorod through Aug 2026)
  // Checked 2026-10-19.
  {
    id: "russia-kursk-belgorod",
    name: "Fighting in Russia's Kursk and Belgorod border areas",
    since: "2022-02-24",
    countries: ["643"],
    areas: [
      [34.2, 51, 35.8, 51.6],
      [35.25, 50.35, 35.8, 51],
      [35.6, 50.15, 37.3, 50.7],
    ],
  },

  // Eastern DR Congo (M23). M23 was largely dormant from its 2013 defeat
  // (brief clashes in Rutshuru in 2017, a short raid on 7 Nov 2021); its
  // current offensive began in the night of 27 Mar 2022 (about 01:00 local
  // on 28 Mar, 23:00 UTC on 27 Mar) at Tshanzu and Runyonyi, Rutshuru, and
  // grew into a continuous campaign: Bunagana (13 Jun 2022), Goma (Jan
  // 2025), Bukavu (Feb 2025), south Lubero to Kipese and Kasugho (2024-25),
  // Uvira (10 Dec 2025 to 17 Jan 2026). Ongoing (Oct 2026) despite the Doha
  // Framework, the Washington Accords and talks in Switzerland. Farmland:
  // harvests disrupted in Masisi, Rutshuru and Nyiragongo (FEWS NET, Dec
  // 2023); looted harvests, burned villages, fields destroyed in the Fizi
  // highlands (Jul 2026). Caveat: the Fizi-Mwenga-Uvira highlands had their
  // own fighting from Feb 2019, so damage there is understated.
  // Boxes: southern North Kivu (Rutshuru, Nyiragongo, Goma, Masisi, eastern
  // Walikale), south Lubero to Kipese and Kasugho, South Kivu from Kalehe and
  // Idjwi to the Fizi/Minembwe highlands and Baraka. The app's map puts the
  // border towns Bunagana and Ishasha in Uganda.
  // Sources:
  //   https://www.aljazeera.com/news/2022/3/28/m23-rebels-attack-military-positions-in-eastern-dr-congo (the start, about 1am local, 23:00 GMT)
  //   https://www.africanews.com/amp/2022/03/29/dr-congo-m23-rebels-shoot-down-monusco-helicopter-as-clashes-in-the-east-continue/
  //   https://en.wikipedia.org/wiki/M23_campaign_(2022%E2%80%93present) (27 March 2022 - present)
  //   https://reliefweb.int/report/democratic-republic-congo/democratic-republic-congo-north-kivu-flash-update-2-humanitarian (OCHA, 31 Mar 2022)
  //   https://www.aljazeera.com/news/2022/6/13/m23-rebels-seize-key-congolese-town-drc-blames-rwanda (Bunagana)
  //   https://fews.net/southern-africa/democratic-republic-congo/food-security-outlook-update/december-2023 (harvests disrupted)
  //   https://en.wikipedia.org/wiki/2025_Butembo_offensive (south Lubero)
  //   https://www.aljazeera.com/news/2025/12/13/residents-emerge-in-dr-congos-tense-uvira-after-m23-rebel-takeover
  //   https://www.criticalthreats.org/briefs/congo-war-security-review/january-21-2026 (M23 left Uvira 17 Jan 2026)
  //   https://www.ictj.org/fr/node/38121 (AP: the army back in Uvira 18 Jan 2026)
  //   https://www.aljazeera.com/news/2026/4/16/drc-and-m23-rebels-eye-peace-monitoring-agreement-in-switzerland
  //   https://www.criticalthreats.org/briefs/congo-war-security-review/may-15-2026 (pull-back from the Ruzizi Plain)
  //   https://www.radiookapi.net/2026/07/01/actualite/securite/violents-affrontements-entre-m23-et-wazalendo-masisi-et-kalehe
  //   https://fr.allafrica.com/stories/202607130235.html (RFI: fields and villages destroyed in Fizi)
  //   https://www.criticalthreats.org/briefs/congo-war-security-review/september-4-2026 (front lines, Sep 2026)
  //   https://www.radiookapi.net/2026/09/29/actualite/securite/affrontements-masisi-la-societe-civile-denonce-la-mort-de-civils-dans
  //   https://actualite.cd/index.php/2026/10/05/lubero-accalmie-apres-quatre-jours-de-combats-entre-les-rebelles-de-lafcm23-et-les (Lubero, 1-5 Oct 2026)
  //   https://www.criticalthreats.org/briefs/congo-war-security-review (7 Oct 2026 fronts)
  //   https://www.aljazeera.com/news/2026/10/13/former-dr-congo-president-kabila-joins-m23-rebels-in-a-new-coalition
  //   https://www.ecoi.net/en/file/local/2035673/20200806.unjhro.analyse_hauts_plateaux_en.pdf (the highlands' fighting from Feb 2019)
  // Checked 2026-10-19.
  {
    id: "eastern-drc-m23",
    name: "War in eastern DR Congo (M23)",
    since: "2022-03-27",
    countries: ["180"],
    areas: [
      [27.9, -1.95, 29.85, -0.6],
      [28.8, -0.6, 29.65, -0.2],
      [28.2, -4.2, 29.4, -1.6],
    ],
  },

  // Ethiopia's Amhara region. Sporadic clashes followed the order of April
  // 2023 to dissolve the regional special forces; full-scale fighting
  // between federal forces and Fano militias broke out on 1 Aug 2023
  // (Gondar, Debre Tabor, near Kobo; Lalibela's airport taken on 2 Aug), with
  // a state of emergency on 4 Aug 2023. Ongoing (Oct 2026): 5,129 deaths in
  // Amhara from Mar 2025 to Mar 2026 (ACLED); since Sep 2026 Fano (AFNM)
  // fights alongside the TPLF. Farmland: drone strikes on markets and
  // farmland, blockades cutting people off from their fields, fertilizer
  // looted or held up. Caveat: in Jul-Dec 2021 TPLF forces held parts of
  // North Wollo, Wag Hemra, South Wollo, North Shewa and the Gondar zones, so
  // 2021 is not a normal year there.
  // Boxes (ten, fitted to the zone edges of the OCHA boundaries): about 97%
  // of the region, and about 96% of the boxed land in Ethiopia is Amhara.
  // Left out: Addis Ababa, Oromia's North Shewa and Sheger, most of Afar and
  // Benishangul, Tigray's Alamata and Korem, Western Tigray and Tselemt.
  // Sources:
  //   https://acleddata.com/brief/fact-sheet-crisis-ethiopias-amhara-region (ACLED, 10 Aug 2023: the April trigger, the 4 Aug state of emergency)
  //   https://www.cgrs.be/sites/default/files/rapporten/coi_focus_ethiopie._veiligheidssituatie_in_amhara_20260528.pdf (CGRS COI, May 2026)
  //   https://www.hrw.org/news/2024/04/04/ethiopia-military-executes-dozens-amhara-region ("outbreak of fighting in Amhara in August 2023")
  //   https://www.aljazeera.com/news/2023/8/9/ethiopian-forces-push-fano-fighters-from-amharas-gondar-city
  //   https://en.wikipedia.org/wiki/War_in_Amhara
  //   https://fews.net/east-africa/ethiopia/key-message-update/september-2024 (fighting into the 2024 harvest)
  //   https://thedefensepost.com/2026/01/21/ethiopia-amhara-drone-strike/ (AFP: 669 killed in 70+ drone strikes since 2023)
  //   https://www.aljazeera.com/news/2026/9/26/is-ethiopia-on-the-verge-of-another-civil-war-as-fighting-erupts-in-tigray
  //   https://www.criticalthreats.org/briefs/ethiopia-war-security-review/ethiopia-war-security-review-september-29-2026
  //   https://en.wikipedia.org/wiki/2026_Ethiopian_offensive
  //   https://www.criticalthreats.org/analysis/Ethiopia-eritrea-tigray-tplf-egypt-somalia-sudan-saf-mali-fla-jnim (Oct 2026: Wurgessa, Mehal Meda)
  //   https://data.humdata.org/dataset/cod-ab-eth (OCHA boundaries, for the boxes)
  // Checked 2026-10-19.
  {
    id: "amhara",
    name: "War in Ethiopia's Amhara region",
    since: "2023-08-01",
    countries: ["231"],
    areas: [
      [35.25, 11.7, 38.8, 13.4],
      [36.4, 10.3, 38.45, 11.7],
      [37.35, 9.9, 38.3, 10.3],
      [38.45, 10.4, 39.85, 12.3],
      [39.85, 10.4, 40.15, 11.5],
      [38.8, 12.3, 39.25, 13.1],
      [38.8, 9.75, 40.05, 10.4],
      [39.3, 8.75, 39.85, 9.75],
      [37.65, 13.4, 38.65, 13.47],
      [36.3, 13.4, 36.55, 13.77],
    ],
  },

  // Israel-Hezbollah war (south Lebanon, northern Israel and the Golan
  // Heights). Began 8 Oct 2023 (Hezbollah fire on three posts in the Shebaa
  // Farms, Israeli artillery and a drone strike in return); a full air and
  // ground campaign from late Sep 2024, a ceasefire on 27 Nov 2024 with
  // strikes going on; a new round from 2 Mar 2026. Not over (Oct 2026):
  // Israel holds a ~10 km zone inside south Lebanon; shelling, strikes and
  // demolitions reported 15-18 Oct 2026. 2019 to 2021 had only one-day
  // flare-ups. Farmland: about 56,000 ha, over 22% of Lebanon's farmland,
  // affected or damaged (FAO via AFP, 1 Oct 2026); most of it lost to
  // access and lost seasons, about 1,380 ha physically damaged (CNRS-L and
  // the ministry, Jun 2026: the Daily Beirut link below); nearly all in the
  // South and Nabatieh (the agriculture minister: The New Arab, Apr 2026,
  // and L'Orient-Le Jour, Jul 2026);
  // fires burned about 39,000 acres in the Golan and Upper Galilee by Aug
  // 2024. The app's map draws the Golan inside Israel (376), so Syria (760)
  // is not listed. Box: south Lebanon to about Sidon and the Awali river
  // (with the south of the West Bekaa), the Western and Upper Galilee, and
  // the northern and central Golan.
  // Sources:
  //   https://www.aljazeera.com/news/2023/10/8/israel-hezbollah-exchange-fire-raising-regional-tensions (the start)
  //   https://vaticannews.va/en/world/news/2024-11/israel-hezbollah-ceasefire-lebanon.html (27 Nov 2024 ceasefire)
  //   https://reliefweb.int/report/lebanon/lebanon-crisis-regional-conflict-flash-update-march-3-2026 (UNFPA: the 2 Mar 2026 round)
  //   https://www.the-star.co.ke/news/world/2026-04-17-israel-lebanon-ceasefire-what-we-know-about-the-deal (16-17 Apr 2026 ceasefire)
  //   https://unsco.unmissions.org/sites/default/files/2026-06/2026.06.18_OCHA_Lebanon_Flash_Update%20No%2036.pdf (OCHA, 18 Jun 2026)
  //   https://www.en.politis.com.cy/news/world/1013652/israel-hezbollah-ceasefire-to-take-effect-within-hours (19 Jun 2026 truce)
  //   https://wtop.com/news/2026/06/israel-and-lebanon-sign-framework-agreement-with-us-in-first-step-toward-peace-rubio-says-2/ (AP, 26 Jun 2026)
  //   https://www.longwarjournal.org/archives/2026/08/israel-says-hezbollah-drone-attack-wounded-3-soldiers-at-ali-al-taher-idf-kills-hezbollah-commanders-in-response.php
  //   https://www.thenationalnews.com/news/mena/2026/09/10/israel-says-south-lebanon-security-zone-complete-after-blowing-up-hezbollah-tunnels-at-ali-al-taher-ridge/
  //   https://www.arabnews.pk/middle-east/israeli-forces-blow-up-school-burn-homes-in-southern-lebanon-lebanese-media-says-3003180 (Houla, 3 Oct 2026)
  //   https://www.aljazeera.com/news/2026/10/11/two-killed-near-israeli-occupied-area-in-south-lebanon (olive harvest, 11 Oct 2026)
  //   https://www.cfr.org/global-conflict-tracker/conflict/political-instability-lebanon (15-18 Oct 2026)
  //   https://english.aawsat.com/arab-world/5324983-un-worried-about-impact-latest-lebanon-war-agriculture (AFP/FAO, 1 Oct 2026: 56,000 ha)
  //   https://dailybeirut.com/en/lebanon-news/south-lebanons-agricultural-production-losses-exceed-530-million-un-lebanese-ass/ (Jun 2026 assessment)
  //   https://www.newarab.com/news/israels-attacks-devastate-over-fifth-lebanon-farmland (minister, Apr 2026)
  //   https://today.lorientlejour.com/article/1541026/agricultural-sector-losses-exceed-1-billion-hani-says-during-visit-to-nabatieh-sour.html
  //   https://kuwaittimes.com/article/20827/business/war-ruined-me-lebanons-farmers-mourn-lost-season (FAO: 1,909 ha, Oct 2023 to Sep 2024)
  //   https://www.worldbank.org/en/news/press-release/2025/03/07/lebanon-s-recovery-and-reconstruction-needs-estimated-at-us-11-billion
  //   https://www.ynetnews.com/magazine/article/bj9i5v95r (Aug 2024: ~39,000 acres burned in the north)
  //   https://www.jns.org/hezbollah-attacks-have-burned-over-57000-acres-in-northern-israel/ (KKL-JNF, Oct 2024)
  //   https://en.wikipedia.org/wiki/2026_Lebanon_war
  // Checked 2026-10-19.
  {
    id: "israel-hezbollah",
    name: "Israel–Hezbollah war (south Lebanon, northern Israel and the Golan Heights)",
    since: "2023-10-08",
    countries: ["422", "376"],
    areas: [[35.08, 32.85, 35.9, 33.6]],
  },

  // Renewed fighting in South Sudan (Upper Nile and Jonglei). The UN dates
  // the breakdown to 4 Mar 2025, when the White Army overran the army
  // barracks in Nasir (skirmishes from 14-15 Feb, helicopter strikes in
  // Ulang and Nyirol on 25 Feb); air strikes followed from mid-March and
  // Riek Machar was put under house arrest on 26 Mar. The 2018 peace deal
  // had held nationally through 2019 to 2021. Ongoing (Oct 2026), no
  // ceasefire. Farmland: villages emptied by ground fighting and air
  // strikes, over 440,000 displaced from Jonglei and Upper Nile (Sep 2026),
  // IPC Phase 5 in Akobo, Fangak, Nyirol, Uror, Nasir and Ulang; planting
  // stopped in places (also an El Nino drought in 2026). Caveat: record
  // floods in 2019 to 2021 and fighting in Jonglei in 2020 make the normal
  // years less reliable. Box: Fangak, Canal/Pigi, Ayod, Nyirol, Uror, Akobo
  // and Duk in Jonglei; Ulang, Nasir, Longochuk, Maiwut, Panyikang and
  // southern Baliet in Upper Nile. Left out: Malakal town, Unity, Ruweng,
  // the Equatorias.
  // Sources:
  //   https://allafrica.com/stories/202503250008.html (UN News, 24 Mar 2025: the Nasir barracks, 4 Mar 2025)
  //   https://www.ewn.co.za/2025/03/25/un-condemns-civilian-casualties-in-deadly-south-sudan-clashes (AFP: bombs with an accelerant)
  //   https://en.wikipedia.org/wiki/2025_Nasir_clashes
  //   https://www.eyeradio.org/sspdf-calls-on-armed-youth-to-retreat-after-ulang-airstrike/ (25 Feb 2025)
  //   https://fews.net/east-africa/south-sudan/key-message-update/january-2026
  //   https://www.sudanspost.com/nearly-8000-displaced-in-pajut-as-sspdf-spla-io-clashes-take-toll-on-civilians/
  //   https://en.wikipedia.org/wiki/Jonglei_clashes_(2025%E2%80%93present)
  //   https://www.securitycouncilreport.org/whatsinblue/2026/04/south-sudan-briefing-and-consultations-31.php
  //   https://www.hrw.org/news/2026/02/27/south-sudan-commissions-renewal-key-amidst-heightened-atrocity-risks-across-the
  //   https://www.foodsecurityportal.org/sites/default/files/2026-04/IPC_SouthSudan_Projection_update_Acute_Food_Insecurity_Malnutrition_April_July2026_Snapshot.pdf
  //   https://fews.net/east-africa/south-sudan/food-security-outlook-update/april-2026
  //   https://fews.net/east-africa/south-sudan/key-message-update/july-2026
  //   https://fews.net/east-africa/south-sudan/food-security-outlook-update/august-2026 (planting prevented, minimal harvests)
  //   https://fews.net/east-africa/south-sudan/key-message-update/september-2026 (clashes 2-21 Sep 2026)
  //   https://www.radiotamazuj.org/en/news/article/sspdf-says-13-spla-io-fighters-killed-in-upper-nile-clashes (Wunkur, 3-4 Oct 2026)
  //   https://www.sudanspost.com/ruweng-officials-claim-sspdf-regains-control-of-wunkur/ (Wunkur is in Ruweng, outside the box)
  //   https://www.geoboundaries.org/api/current/gbOpen/SSD/ADM2/ (county boundaries, for the box)
  // Checked 2026-10-19.
  {
    id: "south-sudan",
    name: "Renewed fighting in South Sudan (Upper Nile and Jonglei)",
    since: "2025-03-04",
    countries: ["728"],
    areas: [[30.5, 7.4, 34.1, 9.5]],
  },

  // Cambodia-Thailand border conflict. Full-scale fighting began on 24 Jul
  // 2025 near the disputed Ta Muen Thom (Ta Moan Thom) temple on the
  // Surin-Oddar Meanchey border (after a skirmish on 28 May 2025); the
  // border saw no armed clashes from 2011, so 2019 to 2021 were quiet. Two
  // rounds: 24-28 Jul 2025 (at least 43 killed) and 7-27 Dec 2025 (at least
  // 101 killed, more than half a million displaced). A ceasefire has held
  // since noon on 27 Dec 2025, with alleged breaches; Thai troops still hold
  // ground taken in December, mines keep fields off limits, and people in
  // 349 Cambodian villages could not farm in 2026. Farmland: rockets and
  // shells in rice, cassava, sugarcane and rubber (Kap Choeng, Ban Kruat);
  // cluster submunitions over Cambodian farmland up to 30 km from the
  // border. Boxes: three sectors along the border, the Dangrek (Buriram,
  // Surin, Sisaket and Ubon opposite Oddar Meanchey and Preah Vihear), Sa
  // Kaeo-Banteay Meanchey, and Trat-Pursat (Chamrak-Thma Da).
  // Sources:
  //   https://euronews.com/video/2025/07/24/escalating-border-conflict-between-thailand-and-cambodia-turns-deadly
  //   https://www.aljazeera.com/news/2025/7/24/thai-military-reports-clash-with-cambodian-troops-at-disputed-border-area
  //   https://kuwaittimes.com/article/36825/world/thailand-cambodia-clashes-reignite-killing-soldier-and-civilians/ (AFP, 8 Dec 2025: 43 killed in July)
  //   https://www.bloomberg.com/news/articles/2025-08-01/thai-cambodia-border-conflict-history-of-dispute-why-tensions-escalated
  //   https://aa.com.tr/en/asia-pacific/deadly-clashes-displace-thousands-along-thai-cambodia-border/3766085
  //   https://www.philstar.com/world/2025/12/22/2496068/cambodia-says-thai-border-clashes-displace-over-half-million/amp/
  //   https://aapnews.aap.com.au/news/thailand-and-cambodia-ink-truce-to-halt-border-conflict (27 Dec 2025 truce: at least 101 killed)
  //   https://www.aljazeera.com/news/2025/12/27/thailand-and-cambodia-agree-on-ceasefire-cambodia-defence-ministry-says
  //   https://www.hawaiitribune-herald.com/?p=354729 (NYT: the 20-day border war)
  //   https://caliber.az/en/post/royal-thai-navy-launches-major-operation-as-border-clashes-with-cambodia-escalate (Trat, Dec 2025)
  //   https://asianews.network/thai-marine-commander-warns-over-alleged-ceasefire-breaches/ (Thmor Da casino held, Mar 2026)
  //   https://opendevelopmentcambodia.net/news/displaced-cambodians-in-thma-da-await-return-home-remain-distrustful-of-thais/
  //   https://www.aljazeera.com/news/2026/5/9/cambodians-struggle-with-displaced-lives-amid-tense-ceasefire-with-thailand
  //   https://www.khaosodenglish.com/news/2026/01/05/eod-inspect-bm-21-rocket-sites-near-thai-cambodian-border/ (Kap Choeng farmland)
  //   https://www.khaosodenglish.com/news/2026/05/08/thai-eod-teams-clear-remaining-bm-21-rockets-in-surin/
  //   https://counteriedreport.com/thailand-120-artillery-shells-cleared-from-buri-ram-farmland/
  //   https://www.mineactionreview.org/assets/downloads/Clearing_CMR_2026_Cambodia.pdf (cluster submunitions on farmland)
  //   https://cambodianess.com/article/unexploded-thai-ordnance-plagues-border-farms-in-over-340-villages (349 villages cannot farm)
  //   https://worldview.ranenetwork.com/content/analysis/2026-08-04/thailand-and-cambodia-maintain-an-uneasy-ceasefire
  //   https://english.cambodiadaily.com/2026/09/09/cambodia-says-ceasefire-cannot-create-new-border-with-thailand/
  //   https://cambojanews.com/hun-manet-airs-thai-border-dispute-at-asia-summit/ (16 Oct 2026: no new fighting since December)
  //   https://en.wikipedia.org/wiki/2025_Cambodian%E2%80%93Thai_border_crisis
  // Checked 2026-10-19.
  {
    id: "thailand-cambodia",
    name: "Cambodia–Thailand border conflict",
    since: "2025-07-24",
    countries: ["764", "116"],
    areas: [
      [102.95, 14.05, 105.25, 14.75],
      [102.45, 13.6, 103.05, 14.3],
      [102.6, 12.05, 102.85, 12.3],
    ],
  },
];

// True when a box [west, south, east, north] holds the point.
const inBox = ([west, south, east, north], lat, lon) => lat >= south && lat <= north && lon >= west && lon <= east;

// True when the war covers a point in a country (countryId may be null at
// sea or outside every outline).
export function conflictCovers(conflict, countryId, lat, lon) {
  if (!conflict) return false;
  const countries = Array.isArray(conflict.countries) ? conflict.countries : [];
  const areas = Array.isArray(conflict.areas) ? conflict.areas : [];
  if (!countries.length && !areas.length) return false;
  if (countries.length && !countries.includes(String(countryId))) return false;
  if (areas.length && !(Number.isFinite(lat) && Number.isFinite(lon) && areas.some((box) => inBox(box, lat, lon)))) return false;
  return true;
}

// The war covering a point in a country, or null.
export function conflictForPoint(countryId, lat, lon) {
  return CONFLICTS.find((conflict) => conflictCovers(conflict, countryId, lat, lon)) || null;
}

// Without a known war, damage is looked for over this many years before
// today (still compared with the normal years).
export const DEFAULT_DAMAGE_YEARS = 2;

// True when a month ("YYYY-MM") ends before its war began (conflict.since
// after the month's last day): a war the team set from a later day, or a
// long re-run reaching back past a new war's start. Such a month has no
// damage window, so no war damage is counted for it, and distance to
// fighting is not measured (server/providers/gee.js monthWindows
// beforeWar); the run still keeps the war (run.conflict), so it compares
// with the area's other months. False at peace and for any month the war
// had begun by.
export function endsBeforeWar(month, conflict) {
  const since = conflict?.since;
  const match = typeof month === "string" ? /^(\d{4})-(\d{2})$/.exec(month) : null;
  if (!since || !match) return false;
  const [year, mon] = [Number(match[1]), Number(match[2])];
  const next = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
  return String(since) >= next;
}

// The boxes of a war on the list ([[west, south, east, north], ...]), found
// by its id (a run keeps only { id, name, since }), or null when it has
// none (it covers its whole countries) or is not on the list (a war the
// team set).
export function warBoxes(conflict) {
  const war = conflict?.id ? CONFLICTS.find((item) => item.id === conflict.id) : null;
  return war?.areas?.length ? war.areas : null;
}

// The squares of a whole-country area that its war's rules apply to, when
// the war covers the country only in part (conflict.partOfCountry: a war
// of the list limited to boxes, server/jobs.js warFor): the ids of the
// cells whose square (cellSizeDeg wide, around the cell's centre) overlaps
// one of the war's boxes. A square that only touches a box counts: at
// Russia's coarse grid no square's centre is inside the Kursk and Belgorod
// boxes. The other squares are read at peace rules (server/providers/gee.js,
// sample.js; scoring.js). Null when every square has the war's rules (no
// partOfCountry, or a war without boxes).
export function warSquares(conflict, cells, cellSizeDeg) {
  const boxes = conflict?.partOfCountry ? warBoxes(conflict) : null;
  if (!boxes) return null;
  const half = (Number(cellSizeDeg) || 0) / 2;
  const ids = new Set();
  for (const cell of cells || []) {
    if (!Number.isFinite(cell?.lat) || !Number.isFinite(cell?.lon)) continue;
    const [west, south, east, north] = [cell.lon - half, cell.lat - half, cell.lon + half, cell.lat + half];
    if (boxes.some(([w, s, e, n]) => west < e && east > w && south < n && north > s)) ids.add(cell.id);
  }
  return ids;
}

// The war that covers a country, or null. A war limited to boxes (areas)
// counts for its whole country here: an Atlas area that is the whole of
// that country holds the war zone (see LIMITS above), and its war's rules
// apply in the squares that touch the boxes (warSquares). For one place use
// conflictForPoint.
export function conflictForCountry(countryId) {
  if (!countryId) return null;
  return CONFLICTS.find((conflict) => (conflict.countries || []).includes(String(countryId))) || null;
}

// Where damage is counted from, for an area or a farm.
//   conflict - from conflictForCountry() (or null)
//   today    - "YYYY-MM-DD"
// Gives back { start, end, conflict } (end not included).
export function damageWindow(conflict, today) {
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (conflict) return { start: conflict.since, end, conflict };
  const year = Number(today.slice(0, 4)) - DEFAULT_DAMAGE_YEARS;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  // 29 February in a year without it becomes 1 March.
  const start = today.slice(5, 10) === "02-29" && !leap ? `${year}-03-01` : `${year}${today.slice(4, 10)}`;
  return { start, end, conflict: null };
}

// ---------- The team's own choice for an area ----------
// Saved on an Atlas area as area.war (PATCH /api/areas/:id, from Atlas
// Settings), and read by server/conflicts.js conflictForArea before the
// list above:
//   { mode: "list" }               the app's list (the default; the server
//                                  then keeps no war field at all)
//   { mode: "war", since, name? }  at war from `since` ("YYYY-MM-DD",
//                                  EARLIEST_WAR_DAY to today), with an
//                                  optional name of up to WAR_NAME_MAX
//                                  characters
//   { mode: "peace" }              not at war, whatever the list says

export const AREA_WAR_MODES = ["list", "war", "peace"];
// The earliest day a war set by the team can count from: the normal years
// 2019 to 2021 must come before the war. For a war that began earlier the
// team counts from this day; damage before it is not counted, and the
// normal years may already hold the war.
export const EARLIEST_WAR_DAY = "2022-01-01";
export const WAR_NAME_MAX = 80;
// What a war set by the team is called when the team gave it no name.
export const TEAM_WAR_NAME = "War (set for this area)";

// True for a real day written "YYYY-MM-DD" (not 2023-02-30).
export function isDay(text) {
  const match = typeof text === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : null;
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Checks a war choice someone sent (the server, and the Settings page
// before it sends).
//   today  "YYYY-MM-DD": the latest day a war can count from
// Gives back { war } with the cleaned choice, or { error } with a message
// a person can read.
export function checkAreaWar(input, today) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: 'Send the war setting as { mode, since, name }, with mode "list", "war" or "peace".' };
  }
  if (!AREA_WAR_MODES.includes(input.mode)) {
    return { error: `The war setting must be "list" (the app's list), "war" (at war from a day) or "peace" (not at war), not "${String(input.mode ?? "").slice(0, 20)}".` };
  }
  if (input.mode !== "war") return { war: { mode: input.mode } };
  const since = typeof input.since === "string" ? input.since.trim() : "";
  if (!isDay(since)) return { error: "Give the day the war began, as YYYY-MM-DD (for example 2023-08-01)." };
  if (since < EARLIEST_WAR_DAY) {
    return { error: `The day must be 1 January 2022 or later: the normal years 2019 to 2021 must come before the war. For a war that began earlier, count from ${EARLIEST_WAR_DAY}.` };
  }
  if (today && since > today) return { error: `The day cannot be after today (${today}).` };
  let name = "";
  if (input.name !== undefined && input.name !== null) {
    if (typeof input.name !== "string") return { error: "The war's name must be text." };
    name = input.name.replace(/\s+/g, " ").trim();
    if (name.length > WAR_NAME_MAX) return { error: `The war's name can have at most ${WAR_NAME_MAX} characters (this one has ${name.length}).` };
  }
  return { war: name ? { mode: "war", since, name } : { mode: "war", since } };
}

// The war a team's choice gives an area:
//   { mode: "war", since, name }  { id: "area-<areaId>", name (or
//                                 TEAM_WAR_NAME), since, source: "area" }
//   { mode: "peace" }             null: not at war, whatever the list says
//   { mode: "list" }, or none     undefined: the app's list decides
export function teamConflict(war, areaId) {
  if (!war || typeof war !== "object") return undefined;
  if (war.mode === "peace") return null;
  if (war.mode === "war" && isDay(war.since)) {
    return { id: `area-${areaId || "custom"}`, name: (typeof war.name === "string" && war.name.trim()) || TEAM_WAR_NAME, since: war.since, source: "area" };
  }
  return undefined;
}
