const nodemailer = require("nodemailer");
const Imap = require("imap");
const { simpleParser } = require("mailparser");

const EMAIL = "a@tribecode.ai";
const PASSWORD = "ipiv egkl euny mxsa";
const TOKEN = "e2e-test-" + Date.now();

async function sendViaSMTP() {
  console.log("1. Sending magic link via Gmail SMTP...");

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: EMAIL, pass: PASSWORD }
  });

  const info = await transporter.sendMail({
    from: `"Bikini Bottom Bets" <${EMAIL}>`,
    to: EMAIL,
    subject: "Your Magic Link to Login - " + new Date().toISOString().slice(11,19),
    html: `
      <h1>Welcome to Bikini Bottom Bets</h1>
      <p>Click below to sign in:</p>
      <a href="https://bikinibottombets-casino.vercel.app/api/auth/verify-magic-link?token=${TOKEN}">
        Sign In Now
      </a>
      <p>This link expires in 15 minutes.</p>
    `
  });

  console.log("   Sent! Message ID:", info.messageId);
  return TOKEN;
}

async function checkForEmail(token, maxWait = 30000) {
  console.log("2. Waiting for email to arrive...");
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const found = await new Promise((resolve) => {
      const imap = new Imap({
        user: EMAIL, password: PASSWORD,
        host: "imap.gmail.com", port: 993, tls: true,
        tlsOptions: { rejectUnauthorized: false }
      });

      imap.once("ready", () => {
        imap.openBox("INBOX", true, (err, box) => {
          if (err) { imap.end(); resolve(null); return; }

          const total = box.messages.total;
          const fetch = imap.fetch(total + ":" + total, { bodies: "" });

          fetch.on("message", (msg) => {
            msg.on("body", (stream) => {
              simpleParser(stream, (err, parsed) => {
                if (err) { imap.end(); resolve(null); return; }

                const html = parsed.html || "";
                if (html.includes(token)) {
                  const match = html.match(/verify-magic-link\?token=([^"&\s<]+)/);
                  imap.end();
                  resolve(match ? match[1] : null);
                } else {
                  imap.end();
                  resolve(null);
                }
              });
            });
          });
        });
      });

      imap.once("error", () => resolve(null));
      imap.connect();
    });

    if (found) {
      console.log("   ✅ Email received! Token:", found);
      return found;
    }

    await new Promise(r => setTimeout(r, 2000));
    process.stdout.write(".");
  }

  console.log("\n   ❌ Email not found after " + (maxWait/1000) + "s");
  return null;
}

async function verifyToken(token) {
  console.log("3. Verifying magic link token...");

  const url = `https://bikinibottombets-casino.vercel.app/api/auth/verify-magic-link?token=${token}`;
  const res = await fetch(url, { redirect: "manual" });

  console.log("   Status:", res.status);
  console.log("   Location:", res.headers.get("location"));

  if (res.status === 302 && res.headers.get("location")?.includes("dashboard")) {
    console.log("   ✅ Token verified! Redirects to dashboard.");
    return true;
  } else {
    const body = await res.text();
    console.log("   ❌ Verification failed:", body);
    return false;
  }
}

async function main() {
  try {
    const sentToken = await sendViaSMTP();
    const receivedToken = await checkForEmail(sentToken);

    if (!receivedToken) {
      console.log("\n❌ E2E TEST FAILED: Email not delivered");
      process.exit(1);
    }

    const verified = await verifyToken(receivedToken);

    if (verified) {
      console.log("\n✅ E2E TEST PASSED: Full magic link flow works!");
      process.exit(0);
    } else {
      console.log("\n❌ E2E TEST FAILED: Token verification failed");
      process.exit(1);
    }
  } catch (err) {
    console.error("\n❌ E2E TEST ERROR:", err.message);
    process.exit(1);
  }
}

main();
