// WHAT THIS FILE DOES
// Ukrainian for the owner's sign-in page (chernozem.app/owner), one
// namespace ("owner"). Keys are the English sentences exactly as
// pages/OwnerPage.jsx writes them, including the error messages it keeps as
// English constants and looks up where they are shown. The two doors'
// labels ("Open Field", "Open Atlas") and captions are in common.js, not
// here.
//
// WHO EDITS IT
// Whoever changes those words. Keep a key identical to the English in the
// page, or the page shows English.

export default {
  // The tab's title and the heading of the page (usePageTitle, h1#ow-title)
  "Owner sign-in": "Вхід для власника",
  // The lead paragraph under the heading (p.pg-lead)
  "Sign in with the Chernozem Google account to change the Ukraine demo. Everyone else can only look at it.":
    "Увійдіть через обліковий запис Google компанії Chernozem, щоб змінювати демо України. Усі інші можуть лише переглядати його.",
  // The main button when nobody is signed in: idle, then busy while the Google window is open
  "Sign in with the Chernozem Google account": "Увійти через обліковий запис Google компанії Chernozem",
  "Signing in…": "Вхід…",
  // The owner's confirmation ({who} = the address in bold, or "the owner") and the text button under it
  "Signed in as {who}. The demo can be changed from this browser.": "Ви увійшли як {who}. Демо можна змінювати з цього браузера.",
  "the owner": "власник",
  "Sign out": "Вийти",
  // The owner's own computer in local development (server mode "open")
  "This computer needs no sign-in: the demo can be changed from here.": "На цьому компʼютері вхід не потрібен: демо можна змінювати звідси.",
  // Another Google account: the refusal (p.ow-refused), its address, and the Sign out button while busy
  "This Google account is not the owner’s.": "Цей обліковий запис Google не належить власнику.",
  "Signed in as {email}.": "Ви увійшли як {email}.",
  "Signing out…": "Вихід…",
  // The error line (p.pg-error): the constants NOT_SET_UP, OFFLINE, PROBLEMS, problemOf and LOADING
  "This server does not take Google sign-ins yet.": "Цей сервер ще не приймає вхід через Google.",
  "Could not reach the server. Check your connection and try again.": "Не вдалося зʼєднатися з сервером. Перевірте зʼєднання і спробуйте ще раз.",
  "The Google window was closed before you signed in. Try again.": "Вікно Google закрито до завершення входу. Спробуйте ще раз.",
  "The browser blocked the Google window. Allow pop-ups for this site and try again.": "Браузер заблокував вікно Google. Дозвольте спливаючі вікна для цього сайту і спробуйте ще раз.",
  "Could not reach Google. Check your connection and try again.": "Не вдалося зʼєднатися з Google. Перевірте зʼєднання і спробуйте ще раз.",
  "Too many attempts. Wait a few minutes and try again.": "Забагато спроб. Зачекайте кілька хвилин і спробуйте ще раз.",
  "This Google account has been switched off.": "Цей обліковий запис Google вимкнено.",
  "Our server could not check the sign-in. Try again.": "Наш сервер не зміг перевірити вхід. Спробуйте ще раз.",
  "Something went wrong ({reason}). Try again.": "Щось пішло не так ({reason}). Спробуйте ще раз.",
  "Something went wrong. Try again.": "Щось пішло не так. Спробуйте ще раз.",
  "The sign-in is still loading. Try again in a moment.": "Вхід ще завантажується. Спробуйте ще раз за хвилину.",
};
