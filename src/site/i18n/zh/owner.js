// WHAT THIS FILE DOES
// Chinese for the owner's sign-in page (pages/OwnerPage.jsx, the "owner"
// namespace, chernozem.app/owner): the heading, the lead, the sign-in and
// sign-out buttons, what the page says to the owner, to the owner's own
// computer and to any other Google account, and the error line. Keys are
// the English sentences exactly as the page writes them; the error
// messages are the page's English constants, looked up where they are
// shown. The two doors' labels and captions (Open Field, Open Atlas and
// their captions) come from common.js.
//
// WHO EDITS IT
// Whoever changes the owner page's words. Keep a key identical to the
// English in the page, or the page shows English. The error sentences
// shared with the Register and Sign-in pages keep the same wording as
// register.js and signin.js.

export default {
  // The tab's title and the heading (h1)
  "Owner sign-in": "所有者登录",
  // The lead under the heading
  "Sign in with the Chernozem Google account to change the Ukraine demo. Everyone else can only look at it.":
    "使用 Chernozem 的 Google 账户登录，即可修改乌克兰演示。其他人只能查看。",
  // The main button when nobody is signed in: idle, then busy
  "Sign in with the Chernozem Google account": "使用 Chernozem 的 Google 账户登录",
  "Signing in…": "正在登录…",
  // The owner's confirmation ({who} is the bold e-mail address or "the owner") and the Sign out text button
  "Signed in as {who}. The demo can be changed from this browser.": "已登录为 {who}。可以在这个浏览器中修改演示。",
  "the owner": "所有者",
  "Sign out": "退出登录",
  // The owner's own computer, with no sign-in set up (local development)
  "This computer needs no sign-in: the demo can be changed from here.": "这台电脑无需登录，可以直接在这里修改演示。",
  // Another Google account: the refusal, its address and the Sign out button while busy
  "This Google account is not the owner’s.": "这个 Google 账户不属于所有者。",
  "Signed in as {email}.": "已登录为 {email}。",
  "Signing out…": "正在退出…",
  // The error line (p.pg-error): the server has no Google sign-in, our server could not be reached
  "This server does not take Google sign-ins yet.": "这台服务器尚未开放 Google 登录。",
  "Could not reach the server. Check your connection and try again.": "无法连接服务器。请检查网络连接并重试。",
  // The error line: Firebase's own failures (the Google window, the network, rate limits, a disabled account)
  "The Google window was closed before you signed in. Try again.": "Google 窗口在您登录前被关闭了。请重试。",
  "The browser blocked the Google window. Allow pop-ups for this site and try again.": "浏览器拦截了 Google 窗口。请允许本网站的弹出窗口，然后重试。",
  "Could not reach Google. Check your connection and try again.": "无法连接 Google。请检查网络连接并重试。",
  "Too many attempts. Wait a few minutes and try again.": "尝试次数过多。请等几分钟再试。",
  "This Google account has been switched off.": "这个 Google 账户已被停用。",
  // The error line: our server could not verify Google's answer, an unknown error, the sign-in still loading
  "Our server could not check the sign-in. Try again.": "我们的服务器无法验证这次登录。请重试。",
  "Something went wrong ({reason}). Try again.": "出错了（{reason}）。请重试。",
  "Something went wrong. Try again.": "出错了。请重试。",
  "The sign-in is still loading. Try again in a moment.": "登录功能还在加载。请稍后重试。",
};
