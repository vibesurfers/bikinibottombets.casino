const Imap = require("imap");
const { simpleParser } = require("mailparser");
const { Resend } = require("resend");

const EMAIL = "a@tribecode.ai";
const PASSWORD = "ipiv egkl euny mxsa";
const RESEND_KEY = "re_U46KWSNR_EiieFHiZSpc4R9o7umTU4FqN";

async function sendMagicLink() {
  const resend = new Resend(RESEND_KEY);
  const token = "test-" + Date.now();

  console.log("1. Sending magic link email...");
  const { data, error } = await resend.emails.send({
    from: "Bikini Bottom Bets <onboarding@resend.dev>",
    to: EMAIL,
    subject: "Your Magic Link - " + new Date().toISOString(),
    html: `<a href="https://bikinibottombets-casino.vercel.app/api/auth/verify-magic-link?token=${token}">Click to login</a>`
  });

  if (error) {
    console.error("SEND FAILED:", error);
    return null;
  }
  console.log("   Sent! ID:", data.id);
  return token;
}

async function checkInbox(folders) {
  return new Promise((resolve) => {
    const imap = new Imap({
      user: EMAIL,
      password: PASSWORD,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });

    const results = [];
    let foldersChecked = 0;

    imap.once("ready", () => {
      folders.forEach(folder => {
        imap.openBox(folder, true, (err, box) => {
          if (err) {
            foldersChecked++;
            if (foldersChecked === folders.length) { imap.end(); resolve(results); }
            return;
          }

          const total = box.messages.total;
          if (total === 0) {
            foldersChecked++;
            if (foldersChecked === folders.length) { imap.end(); resolve(results); }
            return;
          }

          const start = Math.max(1, total - 5);
          const fetch = imap.fetch(start + ":" + total, { bodies: "" });

          fetch.on("message", (msg) => {
            msg.on("body", (stream) => {
              simpleParser(stream, (err, parsed) => {
                if (err) return;
                const from = parsed.from ? parsed.from.text : "";
                const subject = parsed.subject || "";
                if (subject.includes("Magic") || from.includes("resend") || from.includes("Bikini")) {
                  results.push({ folder, from, subject, date: parsed.date });
                }
              });
            });
          });

          fetch.once("end", () => {
            foldersChecked++;
            if (foldersChecked === folders.length) {
              setTimeout(() => { imap.end(); resolve(results); }, 500);
            }
          });
        });
      });
    });

    imap.once("error", (err) => { console.error("IMAP Error:", err.message); resolve(results); });
    imap.connect();
  });
}

async function main() {
  // Send email
  const token = await sendMagicLink();
  if (!token) return;

  // Wait for delivery
  console.log("2. Waiting 10s for delivery...");
  await new Promise(r => setTimeout(r, 10000));

  // Check multiple folders
  console.log("3. Checking inbox and spam...");
  const folders = ["INBOX", "[Gmail]/Spam", "[Gmail]/All Mail"];
  const found = await checkInbox(folders);

  if (found.length > 0) {
    console.log("\n✅ FOUND MAGIC LINK EMAIL(S):");
    found.forEach(e => console.log(`   [${e.folder}] ${e.subject}`));
  } else {
    console.log("\n❌ NO MAGIC LINK EMAIL FOUND");
    console.log("   Email may be blocked or Resend domain not verified");
  }
}

main().catch(console.error);
