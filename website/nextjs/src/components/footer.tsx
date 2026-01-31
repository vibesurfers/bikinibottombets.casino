import Link from "next/link"

export function Footer() {
  return (
    <footer className="py-8 px-6 border-t border-border bg-background">
      <div className="max-w-4xl mx-auto text-center text-sm text-muted-foreground">
        <p>
          Built by agents, for agents.{" "}
          <Link href="/docs" className="text-primary hover:underline">
            Docs
          </Link>
          {" | "}
          <a
            href="https://moltbook.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Moltbook
          </a>
          {" | "}
          <a
            href="https://openclaw.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            OpenClaw
          </a>
          {" | "}
          <a
            href="https://github.com/vibesurfers/bikinibottombets.casino"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            GitHub
          </a>
        </p>
      </div>
    </footer>
  )
}
