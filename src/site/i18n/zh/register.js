// WHAT THIS FILE DOES
// Chinese for the website's Register page (pages/RegisterPage.jsx, the
// "register" namespace): the lead, the panels for someone signed in
// already, the Field-or-Atlas switch, Atlas's organisation and its kind,
// the Google button, the name, e-mail and password fields with their
// checks, every message Firebase or our server can answer with, and the
// pictures' descriptions. The password field and the pictures are drawn on
// the Sign in page too, so their words live here. Keys are the English
// sentences exactly as the page shows them; the checks' and Firebase's
// English lives in src/lib/registration.js and is looked up here where it
// is shown. "Register", "Sign in", "Open Field" and "Open Atlas" are in
// common.js with the menu.
//
// WHO EDITS IT
// Whoever changes the Register page's words. Keep a key identical to the
// English in the page (or in registration.js), or the page shows English.

export default {
  // The lead under the title "Register"
  "An account is free and takes one step.": "账户免费，一步即可。",
  // The "closed" panel: registration cannot take accounts at the moment
  "Registration is not open yet.": "注册尚未开放。",
  "Try the demo, or write to us.": "体验演示，或给我们写信。",
  "Try the demo": "体验演示",
  "Write to us": "给我们写信",
  // The "signed" panel (finished before), the "finish" line and the "owner" panel
  "Signed in as {who}.": "已登录为 {who}。",
  "you": "您",
  "Open {product}": "打开 {product}",
  "Not you? Sign out": "不是您？退出登录",
  "Signed in as {who}, the owner.": "已登录为 {who}（所有者）。",
  "the owner": "所有者",
  "Sign out": "退出登录",
  // The Field-or-Atlas switch at the top of the form
  "Choose Field or Atlas": "选择 Field 或 Atlas",
  "Choose Field or Atlas.": "请选择 Field 或 Atlas。",
  "for my farm": "面向我的农场",
  "for a region": "面向整个地区",
  // The box for a browser Firebase already knows, and its message
  "This browser is signed in as {email}.": "此浏览器已登录为 {email}。",
  "Continue as {email}": "以 {email} 继续",
  "That sign-in has ended. Sign in again with Google or your e-mail.": "该登录已失效。请用 Google 或您的电子邮件重新登录。",
  // Atlas's two answers: the organisation and its kind, with their checks
  "Organisation": "机构",
  "Kind of organisation": "机构类型",
  "Government": "政府",
  "NGO": "非政府组织",
  "Corporation": "企业",
  "Research": "研究机构",
  "Other": "其他",
  "Name your organisation.": "请填写您的机构名称。",
  "Keep the organisation to {n} characters or fewer.": "机构名称请不要超过 {n} 个字符。",
  "Choose what kind of organisation.": "请选择机构类型。",
  // The Google button, and what Firebase or our server can answer under it
  "Continue with Google": "使用 Google 继续",
  "Opening {product}…": "正在打开 {product}…",
  "The sign-in is still loading. Try again in a moment.": "登录功能还在加载。请稍后重试。",
  "The sign-in could not be downloaded. Check your connection and reload the page.": "登录功能未能下载。请检查网络连接并刷新页面。",
  "The Google window was closed before you signed in. Try again.": "Google 窗口在您登录前被关闭了。请重试。",
  "The browser blocked the Google window. Allow pop-ups for this site and try again.": "浏览器拦截了 Google 窗口。请允许本网站的弹出窗口，然后重试。",
  "Could not reach Google to sign in. Check your connection and try again.": "无法连接 Google 进行登录。请检查网络连接并重试。",
  "Google sign-in is not switched on for this address yet. Use an e-mail and a password instead.": "此网址尚未开启 Google 登录。请改用电子邮件和密码。",
  "Too many attempts. Wait a few minutes and try again.": "尝试次数过多。请等几分钟再试。",
  "This account has been switched off. Write to us if that is a mistake.": "此账户已被停用。如有误，请给我们写信。",
  "The sign-in could not be checked by our server. Try again.": "我们的服务器无法核验这次登录。请重试。",
  "Could not reach the server. Check your connection and try again.": "无法连接服务器。请检查网络连接并重试。",
  "Something went wrong ({code}). Try again.": "出错了（{code}）。请重试。",
  "Something went wrong. Try again.": "出错了。请重试。",
  // The divider, then the e-mail way: the name field and its checks
  "or": "或",
  "Name": "姓名",
  "Enter your name.": "请输入您的姓名。",
  "Keep your name to {n} characters or fewer.": "姓名请不要超过 {n} 个字符。",
  // The e-mail field and its checks, with the link beside "already has an account"
  "E-mail": "电子邮件",
  "Enter your e-mail address.": "请输入电子邮件地址。",
  "That e-mail address does not look right.": "这个电子邮件地址看起来不对。",
  "Keep the e-mail to {n} characters or fewer.": "电子邮件地址请不要超过 {n} 个字符。",
  "That e-mail already has an account.": "这个电子邮件地址已有账户。",
  "Sign in instead": "直接登录",
  // The password field (also on the Sign in page): its label, hint, Show button and checks
  "Password": "密码",
  "{n} characters or more": "至少 {n} 个字符",
  "Show": "显示",
  "Hide": "隐藏",
  "Show password": "显示密码",
  "Hide password": "隐藏密码",
  "Enter a password.": "请输入密码。",
  "Use {n} characters or more.": "请至少使用 {n} 个字符。",
  "Keep the password to {n} characters or fewer.": "密码请不要超过 {n} 个字符。",
  "That e-mail and password do not match.": "电子邮件和密码不匹配。",
  // The form's own messages and buttons, and the "finish" form
  "Your sign-in ran out. Sign in again to finish.": "您的登录已过期。请重新登录以完成注册。",
  "Could not save. Try again.": "无法保存。请重试。",
  "Making your account…": "正在创建账户…",
  "Create account": "创建账户",
  "Already have an account?": "已有账户？",
  "Finish registering": "完成注册",
  "Opening…": "正在打开…",
  // The small mark after an optional field's label (no field is optional today)
  "(optional)": "（可选）",
  // The pictures beside the form: the Field set (registration.js PICTURES.field)
  "Field: a farm's fields outlined on the satellite map, Field 11 selected, with its water, plant health, stress and harvest readings":
    "Field：农场的各块田在卫星地图上勾出了边界，已选中 11 号田，显示其水分、作物长势、胁迫和收获时机四项读数",
  "Each field, read after every clear pass": "每块田，每次无云过境后判读",
  "Field's data page: plant health since 2019 against the normal years": "Field 的数据页：2019 年以来的作物长势，对比正常年份",
  "Plant health since 2019": "2019 年以来的作物长势",
  "Field's assistant, with suggested questions about the farm": "Field 的助手，附有关于农场的推荐问题",
  "Ask what changed": "问问发生了什么变化",
  "Field on a phone: the fields on the satellite map": "手机上的 Field：卫星地图上的田块",
  "On your phone": "在您的手机上",
  // The Atlas set (PICTURES.atlas)
  "Atlas: Ukraine's oblasts filled and ranked by near-term priority, Mykolaiv, Kirovohrad and Poltava first":
    "Atlas：乌克兰各州按近期优先级着色并排序，尼古拉耶夫州、基洛沃格勒州和波尔塔瓦州居前",
  "A whole region, ranked": "整个地区，已排序",
  "Atlas: the damage layer of Ukraine, square by square": "Atlas：乌克兰的损毁图层，逐格显示",
  "Damage, square by square": "损毁，逐格显示",
  "Atlas's overview: cropland, black soil, heavy damage and people on damaged land": "Atlas 的概览：耕地、黑土、严重损毁和受损土地上的居民",
  "The month's figures": "本月数字",
  "Atlas's donor report: the headline figures and the top ten areas": "Atlas 的捐助方报告：主要数字和排名前十的地区",
  "A donor report": "捐助方报告",
  // The Sign in page's set (PICTURES.signin): its own captions and alt texts
  "Field: each field after the latest pass": "Field：最近一次过境后的每块田",
  "Atlas: Ukraine's oblasts ranked for the near term": "Atlas：乌克兰各州的近期排序",
  "Atlas: a region, ranked": "Atlas：一个地区，已排序",
};
