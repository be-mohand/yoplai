# E2E: Chat button always starts new session

Date: 2026-09-13. Change: Agents catalog "Chat" click mints fresh `web-*` session key
(`startNewChat`) instead of landing on "main".

Evidence:
- 1st Chat click: localStorage `yoplai:sessionKey:sales=web-mtzzp37l-fi28qf`, no prior value.
  Sent "hello, which session is this?" → session `01a09b76-1d3f-77e8-ad47-4c7306d4b125`, `isMain:false`.
- 2nd Chat click: key rotated to `web-mtzzqiki-g24tjg`. Sent "second chat" →
  new session `01a09b76-e2a1-7c8d-83ef-22bbfde1a826`, `isMain:false`.
- No "MAIN" badge rendered in sidebar; no `sales:main` entry in sessions.json.
- Assistant replies absent: OpenAI account had no credits (env issue, unrelated to routing).
