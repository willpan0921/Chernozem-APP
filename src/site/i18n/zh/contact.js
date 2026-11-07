// WHAT THIS FILE DOES
// Chinese for the website's Contact page (pages/ContactPage.jsx, the
// "contact" namespace): the heading, the form's labels and choices, the
// message box's prompts, the thank-you, the error line's sentences and the
// pictures' descriptions. Keys are the English sentences exactly as the
// page writes them ("E‑mail" keeps its no-break hyphen). The tab title
// "Contact" is in common.js with the menu.
//
// WHO EDITS IT
// Whoever changes the Contact page's words. Keep a key identical to the
// English in the page, or the page shows English.

export default {
  // The heading, the lead and the address under it
  "Write to Chernozem": "写信给 Chernozem",
  "Ask a question, propose a pilot on your land, or tell us what is wrong.": "您可以提问，建议在您的土地上开展试点，或者告诉我们哪里出了问题。",
  "Messages go to {email}. Feel free to email us directly as well.": "留言会发到 {email}。您也可以直接给我们发邮件。",
  // After the message is sent: the thank-you that replaces the form
  "Thank you.": "谢谢。",
  "Your message was received. Any reply will go to {sentTo}.": "您的留言已收到。如有回复，将发送至 {sentTo}。",
  "Send another": "再发一条",
  // Who you are: the legend, its small mark and the five choices
  "Who you are {optional}": "您的身份{optional}",
  "(optional)": "（可选）",
  "Farmer": "农户",
  "Government or NGO": "政府或非政府组织",
  "Corporation": "企业",
  "Researcher": "研究人员",
  "Something else": "其他",
  // The fields: name, e-mail, organisation, message and its length
  "Name": "姓名",
  "E‑mail": "电子邮件",
  "Organisation {optional}": "机构{optional}",
  "Message {limit}": "留言{limit}",
  "({min} to {max} characters)": "（{min} 到 {max} 个字符）",
  // The grey prompt inside the empty message box, one per choice, then the default
  "Where is your farm, and what do you grow?": "您的农场在哪里，种什么作物？",
  "Which country or region, and what do you need to decide?": "哪个国家或地区，您需要做什么决定？",
  "Which farmland or supply region, and what do you need to know about it?": "哪片农田或供应产区，您需要了解它的哪些情况？",
  "What are you working on, and what would help?": "您在研究什么，需要什么帮助？",
  "What would you like to say?": "您想说什么？",
  "Where is your land, and what would you like to do with Chernozem?": "您的土地在哪里，想用 Chernozem 做什么？",
  // The live counter, the robot trap and the Send button
  "{count} of {max} characters": "已输入 {count}/{max} 字符",
  "Website": "网站",
  "Sending…": "正在发送…",
  "Send the message": "发送留言",
  // The error line, by what the server answered (ContactPage.jsx sayRefusal):
  // the server out of reach, too many messages in a row (the wait in
  // minutes), the three 400s a form the browser accepted can still get, and
  // the one sentence for everything else (the form busy, a 500), the address
  // a link. The first and the two 400s read as in register.js.
  "Could not reach the server. Check your connection and try again.": "无法连接服务器。请检查网络连接并重试。",
  "Too many messages in a row. Try again in {minutes} minutes.": "连续发送的留言过多。请等 {minutes} 分钟再试。",
  "Enter your name.": "请输入您的姓名。",
  "That email address does not look right.": "这个电子邮件地址看起来不对。",
  "The message must be at least {min} characters.": "留言至少需要 {min} 个字符。",
  "The message could not be sent. Try again in a moment, or write to {email}.": "留言未能发送。请稍后重试，或写信至 {email}。",
  // The four phone screens beside the form (wide screens only) and their caption
  "Field on a phone: the demo farm's overview, with the fields to watch and the weather": "手机上的 Field：演示农场的概览，显示需要关注的田块和天气",
  "Field on a phone: the farm's fields outlined on the satellite map": "手机上的 Field：卫星地图上，农场的每块田都勾出了边界",
  "Atlas on a phone: Ukraine in September 2026, with the cropland analysed and the damage": "手机上的 Atlas：2026 年 9 月的乌克兰，显示已分析的耕地和损毁情况",
  "Atlas on a phone: the map of Ukraine by priority, with the weights under it": "手机上的 Atlas：按优先级显示的乌克兰地图，下方是权重",
  "Field and Atlas on a phone.": "手机上的 Field 和 Atlas。",
};
