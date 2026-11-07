// WHAT THIS FILE DOES
// Ukrainian for the website's Register page (pages/RegisterPage.jsx, the
// "register" namespace): the lead, the panels for someone signed in, the
// Field-or-Atlas switch, Atlas's organisation and its kind, the Google
// button and the e-mail way with their messages, the buttons, and the
// pictures' descriptions. The password field and the pictures are drawn by
// the Sign in page too, so their words are here. Keys are the English
// sentences exactly as the page writes them; the words of the checks and
// of Firebase live in src/lib/registration.js and are looked up here where
// they are shown. The tab title, the h1 "Register", "Open Field", "Open
// Atlas" and "Sign in" are in common.js.
//
// WHO EDITS IT
// Whoever changes the Register page's words. Keep a key identical to the
// English in the page, or the page shows English.

// A count of characters: 1 символ, 2–4 символи, 5+ символів (21 символ,
// 22 символи, 25 символів). The limits are numbers from registration.js.
const symbols = (n) => {
  const number = Number(n);
  const last = number % 10;
  const tens = number % 100;
  if (last === 1 && tens !== 11) return `${n} символ`;
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return `${n} символи`;
  return `${n} символів`;
};

export default {
  // The lead under the title
  "An account is free and takes one step.": "Обліковий запис безкоштовний — усього один крок.",
  // The "closed" panel: registration cannot take accounts at the moment
  "Registration is not open yet.": "Реєстрація ще не відкрита.",
  "Try the demo, or write to us.": "Спробуйте демо або напишіть нам.",
  "Try the demo": "Спробувати демо",
  "Write to us": "Напишіть нам",
  // Someone signed in: the "signed" panel, the line over the "finish" form, the owner's panel
  "Signed in as {who}.": "Ви увійшли як {who}.",
  "you": "ви",
  "Open {product}": "Відкрити {product}",
  "Not you? Sign out": "Це не ви? Вийти",
  "Signed in as {who}, the owner.": "Ви увійшли як {who} — власник.",
  "the owner": "власник",
  "Sign out": "Вийти",
  // The Field-or-Atlas switch at the top of the form
  "Choose Field or Atlas": "Виберіть Field або Atlas",
  "Choose Field or Atlas.": "Виберіть Field або Atlas.",
  "for my farm": "для мого господарства",
  "for a region": "для регіону",
  // A browser Firebase already knows: "Continue as" and the message under it
  "This browser is signed in as {email}.": "У цьому браузері виконано вхід як {email}.",
  "Continue as {email}": "Продовжити як {email}",
  "That sign-in has ended. Sign in again with Google or your e-mail.": "Цей сеанс завершився. Увійдіть знову через Google або електронну пошту.",
  // Atlas's two answers: the organisation and its kind, with their messages
  "Organisation": "Організація",
  "Kind of organisation": "Тип організації",
  "Government": "Уряд",
  "NGO": "НУО",
  "Corporation": "Компанія",
  "Research": "Дослідження",
  "Other": "Інше",
  "Name your organisation.": "Вкажіть назву організації.",
  "Keep the organisation to {n} characters or fewer.": ({ n }) => `Назва організації має бути не довшою за ${symbols(n)}.`,
  "Choose what kind of organisation.": "Виберіть тип організації.",
  // The Google button and the messages of Firebase and of our server
  "Continue with Google": "Продовжити через Google",
  "Opening {product}…": "Відкриваємо {product}…",
  "The sign-in is still loading. Try again in a moment.": "Вхід ще завантажується. Спробуйте ще раз за хвилину.",
  "The sign-in could not be downloaded. Check your connection and reload the page.": "Не вдалося завантажити вхід. Перевірте зʼєднання й перезавантажте сторінку.",
  "The Google window was closed before you signed in. Try again.": "Вікно Google закрито до завершення входу. Спробуйте ще раз.",
  "The browser blocked the Google window. Allow pop-ups for this site and try again.": "Браузер заблокував вікно Google. Дозвольте спливаючі вікна для цього сайту і спробуйте ще раз.",
  "Could not reach Google to sign in. Check your connection and try again.": "Не вдалося зʼєднатися з Google для входу. Перевірте зʼєднання і спробуйте ще раз.",
  "Google sign-in is not switched on for this address yet. Use an e-mail and a password instead.": "Вхід через Google на цьому сайті ще не увімкнено. Натомість скористайтеся електронною поштою і паролем.",
  "Too many attempts. Wait a few minutes and try again.": "Забагато спроб. Зачекайте кілька хвилин і спробуйте ще раз.",
  "This account has been switched off. Write to us if that is a mistake.": "Цей обліковий запис вимкнено. Напишіть нам, якщо це помилка.",
  "The sign-in could not be checked by our server. Try again.": "Наш сервер не зміг перевірити вхід. Спробуйте ще раз.",
  "Could not reach the server. Check your connection and try again.": "Не вдалося зʼєднатися з сервером. Перевірте зʼєднання і спробуйте ще раз.",
  "Something went wrong ({code}). Try again.": "Щось пішло не так ({code}). Спробуйте ще раз.",
  "Something went wrong. Try again.": "Щось пішло не так. Спробуйте ще раз.",
  // The divider, then the e-mail way: the name
  "or": "або",
  "Name": "Імʼя",
  "Enter your name.": "Введіть своє імʼя.",
  "Keep your name to {n} characters or fewer.": ({ n }) => `Імʼя має бути не довшим за ${symbols(n)}.`,
  // The e-mail and its messages
  "E-mail": "Ел. пошта",
  "Enter your e-mail address.": "Введіть адресу електронної пошти.",
  "That e-mail address does not look right.": "Схоже, ця адреса електронної пошти неправильна.",
  "Keep the e-mail to {n} characters or fewer.": ({ n }) => `Адреса електронної пошти має бути не довшою за ${symbols(n)}.`,
  "That e-mail already has an account.": "Для цієї електронної пошти вже є обліковий запис.",
  "Sign in instead": "Натомість увійдіть",
  // The password: its label, hint, Show button and messages
  "Password": "Пароль",
  "{n} characters or more": ({ n }) => `${symbols(n)} або більше`,
  "Show": "Показати",
  "Hide": "Сховати",
  "Show password": "Показати пароль",
  "Hide password": "Сховати пароль",
  "Enter a password.": "Введіть пароль.",
  "Use {n} characters or more.": ({ n }) => `Пароль має містити щонайменше ${symbols(n)}.`,
  "Keep the password to {n} characters or fewer.": ({ n }) => `Пароль має бути не довшим за ${symbols(n)}.`,
  "That e-mail and password do not match.": "Неправильна електронна пошта або пароль.",
  // Saving the answers, the buttons and the line under the form
  "Your sign-in ran out. Sign in again to finish.": "Ваш сеанс завершився. Увійдіть знову, щоб завершити реєстрацію.",
  "Could not save. Try again.": "Не вдалося зберегти. Спробуйте ще раз.",
  "Making your account…": "Створюємо обліковий запис…",
  "Create account": "Створити обліковий запис",
  "Already have an account?": "Уже маєте обліковий запис?",
  "Finish registering": "Завершити реєстрацію",
  "Opening…": "Відкриваємо…",
  "(optional)": "(необовʼязково)",
  // The pictures beside the form: the Field set (alt, then caption)
  "Field: a farm's fields outlined on the satellite map, Field 11 selected, with its water, plant health, stress and harvest readings": "Field: контури полів господарства на супутниковій карті, вибрано Поле 11 з показниками води, здоровʼя рослин, стресу і часу збирання",
  "Each field, read after every clear pass": "Кожне поле, прочитане після кожного безхмарного проходу",
  "Field's data page: plant health since 2019 against the normal years": "Сторінка «Дані» у Field: здоровʼя рослин з 2019 року проти нормальних років",
  "Plant health since 2019": "Здоровʼя рослин з 2019 року",
  "Field's assistant, with suggested questions about the farm": "Помічник Field із запропонованими запитаннями про господарство",
  "Ask what changed": "Запитайте, що змінилося",
  "Field on a phone: the fields on the satellite map": "Field на телефоні: поля на супутниковій карті",
  "On your phone": "На вашому телефоні",
  // The Atlas set
  "Atlas: Ukraine's oblasts filled and ranked by near-term priority, Mykolaiv, Kirovohrad and Poltava first": "Atlas: області України, зафарбовані й ранжовані за пріоритетом на найближчий час; перші — Миколаївська, Кіровоградська і Полтавська",
  "A whole region, ranked": "Цілий регіон, ранжований",
  "Atlas: the damage layer of Ukraine, square by square": "Atlas: шар пошкоджень України, квадрат за квадратом",
  "Damage, square by square": "Пошкодження, квадрат за квадратом",
  "Atlas's overview: cropland, black soil, heavy damage and people on damaged land": "Огляд Atlas: орні землі, чорноземи, сильні пошкодження і люди на пошкоджених землях",
  "The month's figures": "Цифри за місяць",
  "Atlas's donor report: the headline figures and the top ten areas": "Звіт Atlas для донорів: головні цифри і десять найпріоритетніших територій",
  "A donor report": "Звіт для донорів",
  // The Sign in page's set, drawn by the same component
  "Field: each field after the latest pass": "Field: кожне поле після останнього проходу",
  "Atlas: Ukraine's oblasts ranked for the near term": "Atlas: області України, ранжовані на найближчий час",
  "Atlas: a region, ranked": "Atlas: регіон, ранжований",
};
