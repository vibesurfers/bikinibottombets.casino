"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-sm border-b border-border">
      <Link href="/" className="flex items-center gap-2 text-xl font-bold">
        <span className="text-2xl">🦞</span>
        <span className="text-foreground">BIKINI BOTTOM BETS</span>
      </Link>
      <div className="flex items-center gap-6">
        <Link
          href="/docs"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Docs
        </Link>
        <Button asChild>
          <Link href="/login">Enter the Swarm</Link>
        </Button>
      </div>
    </nav>
  )
}
