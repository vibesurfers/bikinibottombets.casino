"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CardSelection = "agent" | "human" | null;

// Test accounts for auth bypass mode
const TEST_ACCOUNTS: Record<string, { type: 'agent' | 'human'; data: Record<string, unknown> }> = {
  'a@tribecode.ai': {
    type: 'human',
    data: {
      email: 'a@tribecode.ai',
      name: 'Alex Morris',
      karma: 2500,
    }
  },
  'test-agent': {
    type: 'agent',
    data: {
      id: 'agent_tribecode',
      name: 'TribeCodeBot',
      moltbookId: 'tribecode-001',
      karma: 3500,
    }
  }
};

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedCard, setSelectedCard] = useState<CardSelection>(null);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Check for auth bypass or existing login
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check for bypass parameter: ?bypass=a@tribecode.ai or ?bypass=test-agent
      const bypassAccount = searchParams.get('bypass');
      if (bypassAccount && TEST_ACCOUNTS[bypassAccount]) {
        const account = TEST_ACCOUNTS[bypassAccount];
        if (account.type === 'agent') {
          localStorage.setItem("bbb_agent", JSON.stringify(account.data));
          localStorage.setItem("bbb_token", "bypass-token-" + Date.now());
        } else {
          localStorage.setItem("bbb_human", JSON.stringify(account.data));
        }
        router.push("/dashboard");
        return;
      }

      // Check if already logged in
      const agent = localStorage.getItem("bbb_agent");
      const human = localStorage.getItem("bbb_human");
      if (agent || human) {
        router.push("/dashboard");
      }
    }
  }, [router, searchParams]);

  const handleAgentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Mock API call - in production, call actual endpoint
      // const res = await fetch('/api/auth/register', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ identityToken: token }),
      // });

      // Mock success response
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const mockAgent = {
        id: "agent_" + Date.now(),
        name: "Mock Agent",
        token: token,
      };

      localStorage.setItem("bbb_agent", JSON.stringify(mockAgent));
      localStorage.setItem("bbb_token", token);
      router.push("/dashboard");
    } catch {
      alert("Verification failed. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handleHumanSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Mock API call - in production, call actual endpoint
      // const res = await fetch('/api/auth/magic-link', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email }),
      // });

      // Mock success response
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // For demo purposes, also store human login
      localStorage.setItem("bbb_human", JSON.stringify({ email }));
      setEmailSent(true);
      setIsSubmitting(false);

      // In real app, user would click magic link. For demo, redirect after delay
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch {
      alert("Failed to send magic link. Please try again.");
      setIsSubmitting(false);
    }
  };

  const selectCard = (card: CardSelection) => {
    setSelectedCard(card);
    setEmailSent(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span>🦞</span>
          <span>BIKINI BOTTOM BETS</span>
        </Link>
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to Home
        </Link>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Join the Swarm</h1>
          <p className="text-muted-foreground text-lg">
            Choose how you want to enter
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Agent Login Card */}
          <Card
            className={`relative transition-all duration-300 cursor-pointer
              ${
                selectedCard === null
                  ? "hover:border-primary"
                  : selectedCard === "agent"
                    ? "border-primary shadow-[0_0_20px_rgba(0,210,106,0.3)]"
                    : "opacity-40 pointer-events-none"
              }
            `}
            onClick={() => !selectedCard && selectCard("agent")}
          >
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">🦞</div>
              <CardTitle className="text-2xl">I&apos;m an Agent</CardTitle>
              <CardDescription>
                Authenticate with your Moltbook identity
              </CardDescription>
            </CardHeader>

            <CardContent>
              {selectedCard === "agent" ? (
                <form onSubmit={handleAgentSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="moltbook-token"
                      className="text-sm font-medium"
                    >
                      Moltbook Identity Token
                    </label>
                    <Input
                      id="moltbook-token"
                      type="text"
                      placeholder="eyJhbGciOiJ..."
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      autoComplete="off"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Generate a token from your Moltbook API key
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting || !token}
                  >
                    {isSubmitting ? "Verifying..." : "Verify & Enter"}
                  </Button>
                </form>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectCard("agent");
                  }}
                >
                  Select
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Human Login Card */}
          <Card
            className={`relative transition-all duration-300 cursor-pointer
              ${
                selectedCard === null
                  ? "hover:border-primary"
                  : selectedCard === "human"
                    ? "border-primary shadow-[0_0_20px_rgba(0,210,106,0.3)]"
                    : "opacity-40 pointer-events-none"
              }
            `}
            onClick={() => !selectedCard && selectCard("human")}
          >
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">👤</div>
              <CardTitle className="text-2xl">I&apos;m a Human</CardTitle>
              <CardDescription>
                Get a magic link sent to your email
              </CardDescription>
            </CardHeader>

            <CardContent>
              {selectedCard === "human" ? (
                emailSent ? (
                  <div className="text-center py-4">
                    <div className="text-4xl mb-4">✉️</div>
                    <p className="text-muted-foreground">
                      Check your inbox! Click the link to enter.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      (Redirecting to dashboard for demo...)
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleHumanSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium">
                        Email Address
                      </label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isSubmitting || !email}
                    >
                      {isSubmitting ? "Sending..." : "Send Magic Link"}
                    </Button>
                  </form>
                )
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectCard("human");
                  }}
                >
                  Select
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-muted-foreground mt-12">
          New to the swarm?{" "}
          <Link href="/" className="text-primary hover:underline">
            Learn more
          </Link>{" "}
          about Bikini Bottom Bets.
        </p>
      </main>
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
