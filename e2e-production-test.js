const nodemailer = require("nodemailer");
const Imap = require("imap");
const { simpleParser } = require("mailparser");

const EMAIL = "a@tribecode.ai";
const PASSWORD = "ipiv egkl euny mxsa";
const API_BASE = "https://bikinibottombets.casino";

async function step1_requestMagicLink() {
  console.log("STEP 1: Request magic link from production API...");

  const res = await fetch(`${API_BASE}/api/auth/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL })
  });

  const data = await res.json();
  console.log("   Response:", JSON.stringify(data));

  if (!data.success) {
    throw new Error("API returned failure: " + data.error);
  }

  return data;
}

async function step2_waitForEmail(maxWait = 30000) {
  console.log("\nSTEP 2: Wait for email to arrive in All Mail...");
  const start = Date.now();
  const searchDate = new Date();
  searchDate.setMinutes(searchDate.getMinutes() - 5);

  while (Date.now() - start < maxWait) {
    const token = await new Promise((resolve) => {
      const imap = new Imap({
        user: EMAIL, password: PASSWORD,
        host: "imap.gmail.com", port: 993, tls: true,
        tlsOptions: { rejectUnauthorized: false }
      });

      imap.once("ready", () => {
        imap.openBox("[Gmail]/All Mail", true, (err, box) => {
          if (err) { imap.end(); resolve(null); return; }

          // Search for recent magic link emails
          imap.search([
            ["SINCE", new Date(Date.now() - 5*60*1000)],
            ["SUBJECT", "Magic Link"]
          ], (err, results) => {
            if (err || results.length === 0) { imap.end(); resolve(null); return; }

            // Get the most recent one
            const fetch = imap.fetch(results.slice(-1), { bodies: "" });
            fetch.on("message", (msg) => {
              msg.on("body", (stream) => {
                simpleParser(stream, (err, parsed) => {
                  if (err) { imap.end(); resolve(null); return; }

                  const html = parsed.html || "";
                  const match = html.match(/verify-magic-link\?token=([a-f0-9]{64})/);

                  // Check if this is a recent email (within last 2 min)
                  const emailDate = new Date(parsed.date);
                  const now = new Date();
                  const ageMs = now - emailDate;

                  if (match && ageMs < 120000) {
                    console.log("   Found recent magic link email!");
                    console.log("   Subject:", parsed.subject);
                    imap.end();
                    resolve(match[1]);
                  } else {
                    imap.end();
                    resolve(null);
                  }
                });
              });
            });
            fetch.once("end", () => {});
          });
        });
      });

      imap.once("error", () => resolve(null));
      imap.connect();
    });

    if (token) {
      console.log("   Token:", token.substring(0, 20) + "...");
      return token;
    }

    process.stdout.write(".");
    await new Promise(r => setTimeout(r, 3000));
  }

  throw new Error("Email not received within " + (maxWait/1000) + " seconds");
}

async function step3_verifyToken(token) {
  console.log("\nSTEP 3: Verify token with production API...");

  const url = `${API_BASE}/api/auth/verify-magic-link?token=${token}`;
  const res = await fetch(url, { redirect: "manual" });

  console.log("   Status:", res.status);
  const location = res.headers.get("location");
  console.log("   Location:", location);

  if (res.status === 302 && location && location.includes("dashboard")) {
    // Extract session from redirect URL
    const sessionMatch = location.match(/session=([^&]+)/);
    if (sessionMatch) {
      const sessionData = JSON.parse(Buffer.from(sessionMatch[1], "base64").toString());
      console.log("   Session email:", sessionData.email);
    }
    return true;
  }

  const body = await res.text();
  console.log("   Body:", body);
  return false;
}

async function main() {
  console.log("=".repeat(50));
  console.log("E2E MAGIC LINK TEST - PRODUCTION");
  console.log("=".repeat(50));
  console.log("Target email:", EMAIL);
  console.log("API:", API_BASE);
  console.log("");

  try {
    await step1_requestMagicLink();
    const token = await step2_waitForEmail();
    const verified = await step3_verifyToken(token);

    console.log("\n" + "=".repeat(50));
    if (verified) {
      console.log("✅ E2E TEST PASSED!");
      console.log("   Magic link flow is working correctly.");
    } else {
      console.log("❌ E2E TEST FAILED!");
      console.log("   Token verification failed.");
    }
    console.log("=".repeat(50));

    process.exit(verified ? 0 : 1);
  } catch (err) {
    console.log("\n" + "=".repeat(50));
    console.log("❌ E2E TEST FAILED!");
    console.log("   Error:", err.message);
    console.log("=".repeat(50));
    process.exit(1);
  }
}

main();
