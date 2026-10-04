// Generates the push secrets on YOUR machine and writes a copy-paste sheet.
// Usage: npm run setup:push -- https://min-zg3u.vercel.app you@example.com
// Output: push-setup.local.txt (git-ignored). Nothing secret is printed to the terminal.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import webpush from "web-push";

const appUrl = (process.argv[2] || "https://min-zg3u.vercel.app").replace(/\/$/, "");
const email = process.argv[3] || "you@example.com";
const vapid = webpush.generateVAPIDKeys();
const cron = randomBytes(24).toString("base64url");
const sql = readFileSync("supabase/v0.3-push.sql", "utf8").replaceAll("<APP_URL>", appUrl).replaceAll("<CRON_SECRET>", cron);

const sheet = `KROB PUSH SETUP - keep this file private, delete it when done
==============================================================

STEP 1 - Vercel > ${appUrl.replace("https://", "")} > Settings > Environment Variables
(Environment: Production + Preview, then Redeploy)

NEXT_PUBLIC_VAPID_PUBLIC_KEY = ${vapid.publicKey}
VAPID_PRIVATE_KEY            = ${vapid.privateKey}
VAPID_SUBJECT                = mailto:${email}
CRON_SECRET                  = ${cron}
SUPABASE_SERVICE_ROLE_KEY    = (copy from Supabase > Project Settings > API keys > secret / service_role)
ANTHROPIC_API_KEY            = (optional, for AI coach: console.anthropic.com > API keys)

STEP 2 - Supabase > SQL Editor > New query > paste everything below > Run
------------------------------------------------------------------------
${sql}
`;
writeFileSync("push-setup.local.txt", sheet);
console.log("Written push-setup.local.txt (git-ignored). Open it and follow STEP 1 and STEP 2.");
console.log("App URL used:", appUrl);
