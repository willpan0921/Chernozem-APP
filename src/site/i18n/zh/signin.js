// WHAT THIS FILE DOES
// Chinese for the website's Sign in page (pages/SignInPage.jsx, the
// "signin" namespace): the lead under the heading, the panels for someone
// already signed in (an account, the owner, an unfinished registration),
// the closed panel when registration is not open, the form (Google, or
// e-mail and password, "Forgot it?", the reset note) and every sentence the
// page can say beside a field or under a button (useSaid). Keys are the
// English sentences exactly as the page writes them. "Sign in", "Register",
// "Open Field" and "Open Atlas" are in common.js with the menu.
//
// The Register page (zh/register.js) has the same form and the same
// Firebase sentences; the shared ones ("E-mail", "Sign out", "Continue with
// Google", "Registration is not open yet.", "That sign-in has ended...",
// the e-mail checks, the Google and server errors) are worded as there.
//
// WHO EDITS IT
// Whoever changes the Sign in page's words. Keep a key identical to the
// English in the page, or the page shows English.

export default {
  // The lead under the heading "Sign in"
  "Your fields or your region, as you left them.": "您的田块或地区，还是您离开时的样子。",
  // The closed panel: registration is not open; the demo and the Contact page instead
  "Registration is not open yet.": "注册尚未开放。",
  "Try the demo, or write to us.": "体验演示，或给我们写信。",
  "Try the demo": "体验演示",
  "Write to us": "给我们写信",
  // The signed panel: an account with a finished registration ({email} is the bold address)
  "Signed in as {email}.": "已登录为 {email}。",
  "Open {product}": "打开 {product}",
  "Sign out": "退出登录",
  // The owner panel: the Chernozem Google account; "the owner" fills the bold hole when the address is unknown.
  // Named as what it is (the Chernozem Google account), so the sentence reads
  // 已登录为 Chernozem 的 Google 账户（所有者）。 and not 已登录为 所有者（所有者）。
  "Signed in as {email}, the owner.": "已登录为 {email}（所有者）。",
  "the owner": "Chernozem 的 Google 账户",
  // The unfinished panel: an account whose registration was never completed
  "Signed in as {email}. Registering is not finished yet.": "已登录为 {email}。注册尚未完成。",
  "Finish registering": "完成注册",
  // The form's top: a person this browser still remembers
  "This browser is signed in as {email}.": "此浏览器已登录为 {email}。",
  "Continue as {email}": "以 {email} 继续",
  "Not you? Sign out": "不是您？退出登录",
  // The form: the Google button, the separator, the e-mail field, "Forgot it?" and the reset note
  "Continue with Google": "使用 Google 继续",
  "or": "或",
  "E-mail": "电子邮件",
  "Forgot it?": "忘记了？",
  "If {email} has an account, a link to choose a new password is on its way.": "如果 {email} 有账户，设置新密码的链接已经发出。",
  // The submit button while busy, and the aside under it ({register} is the link "Register")
  "Signing in…": "正在登录…",
  "New here? {register}": "新用户？{register}",
  // The error sentences (useSaid): Firebase's code still loading or not downloaded, the page's own checks
  "The sign-in is still loading. Try again in a moment.": "登录功能还在加载。请稍后重试。",
  "The sign-in could not be downloaded. Check your connection and reload the page.": "登录功能未能下载。请检查网络连接并刷新页面。",
  "Enter your password.": "请输入密码。",
  "Enter your e-mail first; the link goes there.": "请先输入电子邮件地址，链接会发到那里。",
  "That sign-in has ended. Sign in again with Google or your e-mail.": "该登录已失效。请用 Google 或您的电子邮件重新登录。",
  // The e-mail checks (shared with the Register page) and the account errors
  "Enter your e-mail address.": "请输入电子邮件地址。",
  "That e-mail address does not look right.": "这个电子邮件地址看起来不对。",
  "Keep the e-mail to {n} characters or fewer.": "电子邮件地址请不要超过 {n} 个字符。",
  "That e-mail and password do not match.": "电子邮件和密码不匹配。",
  "That e-mail already has an account.": "这个电子邮件地址已有账户。",
  "This account has been switched off. Write to us if that is a mistake.": "此账户已被停用。如有误，请给我们写信。",
  "Too many attempts. Wait a few minutes and try again.": "尝试次数过多。请等几分钟再试。",
  // The Google pop-up and the network
  "The Google window was closed before you signed in. Try again.": "Google 窗口在您登录前被关闭了。请重试。",
  "The browser blocked the Google window. Allow pop-ups for this site and try again.": "浏览器拦截了 Google 窗口。请允许本网站的弹出窗口，然后重试。",
  "Could not reach Google to sign in. Check your connection and try again.": "无法连接 Google 进行登录。请检查网络连接并重试。",
  "Google sign-in is not switched on for this address yet. Use an e-mail and a password instead.": "此网址尚未开启 Google 登录。请改用电子邮件和密码。",
  // Our server, and the generic error (with and without a code)
  "The sign-in could not be checked by our server. Try again.": "我们的服务器无法核验这次登录。请重试。",
  "Could not reach the server. Check your connection and try again.": "无法连接服务器。请检查网络连接并重试。",
  "Something went wrong ({code}). Try again.": "出错了（{code}）。请重试。",
  "Something went wrong. Try again.": "出错了。请重试。",
};
