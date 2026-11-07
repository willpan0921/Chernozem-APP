// WHAT THIS FILE DOES
// Ukrainian for the website's Sign in page (pages/SignInPage.jsx, the
// "signin" namespace): the lead, the panels for someone already signed in
// (an account, the owner, an unfinished registration), the closed panel
// shown while Authentication is switched off, the form, and every sentence
// the page can say beside a field or under a button (useSaid). Keys are the
// English sentences exactly as the page writes them. "Sign in", "Register",
// "Open Field" and "Open Atlas" are in common.js with the menu. The Register
// page says several of these too (E-mail, Sign out, Continue with Google,
// the e-mail checks): keep one wording across the two.
//
// WHO EDITS IT
// Whoever changes the Sign in page's words. Keep a key identical to the
// English in the page, or the page shows English.

// символ · символи · символів by the number's last digits: 1 символ, 2–4
// символи, 5 and more символів; 11–14 (111–114, …) take символів.
function characters(n) {
  const count = Math.abs(Number(n)) || 0;
  const last = count % 10;
  const tens = count % 100;
  if (last === 1 && tens !== 11) return "символ";
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return "символи";
  return "символів";
}

export default {
  // The lead under the heading «Увійти» (p.reg-lead)
  "Your fields or your region, as you left them.": "Ваші поля чи ваш регіон — такі, якими ви їх залишили.",
  // The closed panel, while Authentication is switched off: the h2, the sentence, the button and the link
  "Registration is not open yet.": "Реєстрація ще не відкрита.",
  "Try the demo, or write to us.": "Спробуйте демо або напишіть нам.",
  "Try the demo": "Спробувати демо",
  "Write to us": "Напишіть нам",
  // The signed panel, an account whose registration is complete ({email} = the bold address; {product} = Field or Atlas)
  "Signed in as {email}.": "Ви увійшли як {email}.",
  "Open {product}": "Відкрити {product}",
  "Sign out": "Вийти",
  // The owner panel, the Chernozem Google account ({email} = the bold address, or «власник» when it is unknown)
  "Signed in as {email}, the owner.": "Ви увійшли як {email} — власник.",
  "the owner": "власник",
  // The unfinished panel, an account whose registration was never completed
  "Signed in as {email}. Registering is not finished yet.": "Ви увійшли як {email}. Реєстрацію ще не завершено.",
  "Finish registering": "Завершити реєстрацію",
  // The form, top to bottom: the browser still remembers a person ({email} = the bold address, then the plain address)
  "This browser is signed in as {email}.": "У цьому браузері виконано вхід як {email}.",
  "Continue as {email}": "Продовжити як {email}",
  "Not you? Sign out": "Це не ви? Вийти",
  // The Google button, the separator and the e-mail field's label
  "Continue with Google": "Продовжити через Google",
  "or": "або",
  "E-mail": "Ел. пошта",
  // Beside the password: the reset button and its note ({email} = the typed address, plain text)
  "Forgot it?": "Забули?",
  "If {email} has an account, a link to choose a new password is on its way.": "Якщо для {email} є обліковий запис, посилання для створення нового пароля вже надіслано.",
  // The submit button while busy, and the aside under it ({register} = the link «Зареєструватися»)
  "Signing in…": "Вхід…",
  "New here? {register}": "Уперше тут? {register}",
  // What the page says beside a field or under a button (useSaid). First the sign-in's own code, still downloading or failed
  "The sign-in is still loading. Try again in a moment.": "Вхід ще завантажується. Спробуйте ще раз за хвилину.",
  "The sign-in could not be downloaded. Check your connection and reload the page.": "Не вдалося завантажити вхід. Перевірте зʼєднання й перезавантажте сторінку.",
  // The page's own checks: the empty password, «Forgot it?» with no e-mail, a remembered sign-in that ended
  "Enter your password.": "Введіть пароль.",
  "Enter your e-mail first; the link goes there.": "Спершу введіть адресу електронної пошти — на неї надійде посилання.",
  "That sign-in has ended. Sign in again with Google or your e-mail.": "Цей сеанс завершився. Увійдіть знову через Google або електронну пошту.",
  // The e-mail checks (src/lib/registration.js emailProblem), the same sentences as on the Register page
  "Enter your e-mail address.": "Введіть адресу електронної пошти.",
  "That e-mail address does not look right.": "Схоже, ця адреса електронної пошти неправильна.",
  "Keep the e-mail to {n} characters or fewer.": ({ n }) => `Адреса електронної пошти має бути не довшою за {n} ${characters(n)}.`,
  // Firebase's answers (firebaseProblem): the pair refused, an address taken another way, a disabled account, the rate limit, the Google window
  "That e-mail and password do not match.": "Неправильна електронна пошта або пароль.",
  "That e-mail already has an account.": "Для цієї електронної пошти вже є обліковий запис.",
  "This account has been switched off. Write to us if that is a mistake.": "Цей обліковий запис вимкнено. Напишіть нам, якщо це помилка.",
  "Too many attempts. Wait a few minutes and try again.": "Забагато спроб. Зачекайте кілька хвилин і спробуйте ще раз.",
  "The Google window was closed before you signed in. Try again.": "Вікно Google закрито до завершення входу. Спробуйте ще раз.",
  "The browser blocked the Google window. Allow pop-ups for this site and try again.": "Браузер заблокував вікно Google. Дозвольте спливаючі вікна для цього сайту і спробуйте ще раз.",
  "Could not reach Google to sign in. Check your connection and try again.": "Не вдалося зʼєднатися з Google для входу. Перевірте зʼєднання і спробуйте ще раз.",
  "Google sign-in is not switched on for this address yet. Use an e-mail and a password instead.": "Вхід через Google на цьому сайті ще не увімкнено. Натомість скористайтеся електронною поштою і паролем.",
  // Our server's answers, and the unexpected error with or without its code ({code} stays Latin)
  "The sign-in could not be checked by our server. Try again.": "Наш сервер не зміг перевірити вхід. Спробуйте ще раз.",
  "Could not reach the server. Check your connection and try again.": "Не вдалося зʼєднатися з сервером. Перевірте зʼєднання і спробуйте ще раз.",
  "Something went wrong ({code}). Try again.": "Щось пішло не так ({code}). Спробуйте ще раз.",
  "Something went wrong. Try again.": "Щось пішло не так. Спробуйте ще раз.",
};
