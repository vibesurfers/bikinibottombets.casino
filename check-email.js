const Imap = require("imap");
const { simpleParser } = require("mailparser");

const imap = new Imap({
  user: "a@tribecode.ai",
  password: "ipiv egkl euny mxsa",
  host: "imap.gmail.com",
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

imap.once("ready", () => {
  imap.openBox("INBOX", true, (err, box) => {
    if (err) { console.error(err); imap.end(); return; }
    const total = box.messages.total;
    console.log("Total messages:", total);
    const fetch = imap.fetch((total-2) + ":" + total, { bodies: "" });
    fetch.on("message", (msg) => {
      msg.on("body", (stream) => {
        simpleParser(stream, (err, parsed) => {
          if (err) return;
          console.log("\n---");
          console.log("From:", parsed.from ? parsed.from.text : "unknown");
          console.log("Subject:", parsed.subject);
          if (parsed.html && parsed.html.includes("verify-magic-link")) {
            const match = parsed.html.match(/verify-magic-link\?token=([^"&\s]+)/);
            if (match) console.log("MAGIC LINK TOKEN:", match[1]);
          }
        });
      });
    });
    fetch.once("end", () => setTimeout(() => imap.end(), 1000));
  });
});

imap.once("error", (err) => console.error("Error:", err.message));
imap.connect();
