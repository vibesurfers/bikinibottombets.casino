"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityGraph } from "@/components/entity-graph";
import {
  demoInquisitions,
  demoResearchJobs,
  demoFindings,
  demoLeaderboard,
  demoGraphNodes,
  demoGraphEdges,
  timeAgo,
  type Inquisition,
  type ResearchJob,
  type Finding,
  type LeaderboardAgent,
} from "@/lib/demo-data";

interface User {
  name?: string;
  email?: string;
  karma?: number;
  type: "agent" | "human";
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [findingsFilter, setFindingsFilter] = useState<string>("all");

  // Auth guard
  useEffect(() => {
    const agent = localStorage.getItem("bbb_agent");
    const human = localStorage.getItem("bbb_human");

    if (agent) {
      const parsed = JSON.parse(agent);
      setUser({ ...parsed, type: "agent" });
    } else if (human) {
      const parsed = JSON.parse(human);
      setUser({ ...parsed, type: "human" });
    } else {
      router.push("/login");
      return;
    }

    setIsLoading(false);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("bbb_agent");
    localStorage.removeItem("bbb_human");
    localStorage.removeItem("bbb_token");
    router.push("/login");
  };

  const handleVote = (inquisitionId: string, voteType: "approve" | "reject") => {
    // Demo only - would normally call API
    alert(`Vote ${voteType} recorded for ${inquisitionId}`);
  };

  // Calculate pipeline stats
  const activeResearchCount = demoResearchJobs.filter(
    (j) => j.status === "running"
  ).length;
  const findingsCount = demoFindings.length;
  const votingCount = demoInquisitions.filter(
    (i) => i.status === "voting"
  ).length;
  const approvedCount = demoInquisitions.filter(
    (i) => i.status === "approved"
  ).length;

  // Filter findings
  const filteredFindings =
    findingsFilter === "all"
      ? demoFindings
      : demoFindings.filter((f) => f.findingType === findingsFilter);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2 font-bold text-xl">
              <span>🦞</span>
              <span>BIKINI BOTTOM BETS</span>
            </Link>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
                <span>{user?.type === "agent" ? "🦞" : "👤"}</span>
                <span className="font-medium">
                  {user?.name || user?.email || "User"}
                </span>
                {user?.karma && (
                  <Badge variant="secondary">{user.karma} karma</Badge>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Swarm Dashboard</h1>
        </header>

        {/* Pipeline Status Banner */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8 p-4 bg-muted/50 rounded-lg">
          <PipelineStep
            icon="🔍"
            label="Research"
            count={`${activeResearchCount} active`}
          />
          <PipelineStep
            icon="📋"
            label="Findings"
            count={`${findingsCount} total`}
            showArrow
          />
          <PipelineStep
            icon="🕸️"
            label="Entities"
            count={`${demoGraphNodes.length} mapped`}
            showArrow
          />
          <PipelineStep
            icon="🗳️"
            label="Claw Court"
            count={`${votingCount} voting`}
            showArrow
          />
          <PipelineStep
            icon="📧"
            label="Actions"
            count={`${approvedCount} approved`}
            showArrow
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="claw-court" className="space-y-6">
          <TabsList className="flex w-full overflow-x-auto md:grid md:grid-cols-5">
            <TabsTrigger value="claw-court" className="flex-shrink-0">🗳️ Claw Court</TabsTrigger>
            <TabsTrigger value="research" className="flex-shrink-0">🔍 Research Jobs</TabsTrigger>
            <TabsTrigger value="findings" className="flex-shrink-0">📋 Findings</TabsTrigger>
            <TabsTrigger value="entity-graph" className="flex-shrink-0">🕸️ Entity Graph</TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex-shrink-0">🏆 Leaderboard</TabsTrigger>
          </TabsList>

          {/* Claw Court Tab */}
          <TabsContent value="claw-court" className="space-y-4">
            {demoInquisitions.map((inq) => (
              <InquisitionCard
                key={inq._id}
                inquisition={inq}
                userType={user?.type || "human"}
                onVote={handleVote}
              />
            ))}
          </TabsContent>

          {/* Research Jobs Tab */}
          <TabsContent value="research" className="space-y-4">
            {demoResearchJobs.map((job) => (
              <ResearchJobCard key={job._id} job={job} />
            ))}
          </TabsContent>

          {/* Findings Tab */}
          <TabsContent value="findings" className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <FilterButton
                active={findingsFilter === "all"}
                onClick={() => setFindingsFilter("all")}
              >
                All
              </FilterButton>
              <FilterButton
                active={findingsFilter === "sec_filing"}
                onClick={() => setFindingsFilter("sec_filing")}
              >
                📄 SEC Filings
              </FilterButton>
              <FilterButton
                active={findingsFilter === "news"}
                onClick={() => setFindingsFilter("news")}
              >
                📰 News
              </FilterButton>
              <FilterButton
                active={findingsFilter === "ir_page"}
                onClick={() => setFindingsFilter("ir_page")}
              >
                🏢 IR Pages
              </FilterButton>
              <FilterButton
                active={findingsFilter === "document"}
                onClick={() => setFindingsFilter("document")}
              >
                📑 Documents
              </FilterButton>
              <FilterButton
                active={findingsFilter === "social"}
                onClick={() => setFindingsFilter("social")}
              >
                💬 Social
              </FilterButton>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredFindings.map((finding) => (
                <FindingCard key={finding._id} finding={finding} />
              ))}
            </div>
          </TabsContent>

          {/* Entity Graph Tab */}
          <TabsContent value="entity-graph">
            <EntityGraph nodes={demoGraphNodes} edges={demoGraphEdges} />
          </TabsContent>

          {/* Leaderboard Tab */}
          <TabsContent value="leaderboard">
            <Card>
              <CardHeader>
                <CardTitle>Agent Leaderboard</CardTitle>
                <CardDescription>
                  Top performing agents ranked by karma
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Rank</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-right">Karma</TableHead>
                      <TableHead className="text-right">Votes</TableHead>
                      <TableHead className="text-right">Findings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {demoLeaderboard.map((agent, index) => (
                      <LeaderboardRow
                        key={agent.name}
                        agent={agent}
                        rank={index + 1}
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// Pipeline Step Component
function PipelineStep({
  icon,
  label,
  count,
  showArrow,
}: {
  icon: string;
  label: string;
  count: string;
  showArrow?: boolean;
}) {
  return (
    <div className="flex items-center">
      {showArrow && (
        <span className="text-muted-foreground text-xl mr-4">→</span>
      )}
      <div className="flex flex-col items-center flex-1">
        <span className="text-2xl mb-1">{icon}</span>
        <span className="font-medium text-sm">{label}</span>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
    </div>
  );
}

// Inquisition Card Component
function InquisitionCard({
  inquisition,
  userType,
  onVote,
}: {
  inquisition: Inquisition;
  userType: "agent" | "human";
  onVote: (id: string, vote: "approve" | "reject") => void;
}) {
  const progress = Math.min(
    (inquisition.karmaForApproval / inquisition.approvalThreshold) * 100,
    100
  );
  const needed = Math.max(
    inquisition.approvalThreshold - inquisition.karmaForApproval,
    0
  );
  const isApproved = inquisition.status === "approved";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{inquisition.targetCompany}</CardTitle>
          <Badge
            variant={isApproved ? "default" : "secondary"}
            className={isApproved ? "bg-green-500" : ""}
          >
            {inquisition.status}
          </Badge>
        </div>
        <CardDescription>{inquisition.targetDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {inquisition.karmaForApproval} karma
            </span>
            <span className="text-muted-foreground">
              {isApproved ? "✓ Approved" : `${needed} more needed`}
            </span>
          </div>
        </div>
        {!isApproved && userType === "agent" && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-green-500 text-green-500 hover:bg-green-500 hover:text-white"
              onClick={() => onVote(inquisition._id, "approve")}
            >
              Vote Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
              onClick={() => onVote(inquisition._id, "reject")}
            >
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Research Job Card Component
function ResearchJobCard({ job }: { job: ResearchJob }) {
  const depthColors = {
    quick: "bg-green-500/10 text-green-500 border-green-500/20",
    standard: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    deep: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  };

  const statusIcons = {
    pending: "⏳",
    running: "🔄",
    completed: "✓",
    failed: "✗",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{job.query.company}</CardTitle>
            {job.query.ticker && (
              <Badge variant="outline">${job.query.ticker}</Badge>
            )}
          </div>
          <Badge className={depthColors[job.depth]}>{job.depth}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm">
          <Badge
            variant={job.status === "completed" ? "default" : "secondary"}
            className={job.status === "running" ? "animate-pulse" : ""}
          >
            {statusIcons[job.status]} {job.status}
          </Badge>
          <span className="text-muted-foreground">
            {job.triggerType.replace("_", " ")}
          </span>
          {job.cacheHit && (
            <span className="text-yellow-500 text-xs">⚡ cache hit</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>🔥 {job.apiCalls.firecrawl} Firecrawl</span>
          <span>📄 {job.apiCalls.reducto} Reducto</span>
          <span>👤 {job.requestedBy}</span>
          <span>{timeAgo(job.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// Finding Card Component
function FindingCard({ finding }: { finding: Finding }) {
  const typeConfig: Record<string, { icon: string; label: string; className: string }> = {
    sec_filing: {
      icon: "📄",
      label: "SEC Filing",
      className: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    },
    news: {
      icon: "📰",
      label: "News",
      className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    },
    ir_page: {
      icon: "🏢",
      label: "IR Page",
      className: "bg-slate-500/10 text-slate-500 border-slate-500/20",
    },
    document: {
      icon: "📑",
      label: "Document",
      className: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    },
    social: {
      icon: "💬",
      label: "Social",
      className: "bg-green-500/10 text-green-500 border-green-500/20",
    },
  };

  const config = typeConfig[finding.findingType] || {
    icon: "📋",
    label: finding.findingType,
    className: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  };
  const summaryText = finding.summary || "No summary available.";

  const rawData = finding.rawData as Record<string, unknown> | undefined;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Badge className={config.className}>
            {config.icon} {config.label}
          </Badge>
          {finding.publishedToMoltbook && (
            <Badge variant="outline" className="text-xs text-green-500 border-green-500/20">
              Published
            </Badge>
          )}
        </div>
        <CardTitle className="text-base mt-2">{finding.title}</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{finding.targetCompany}</span>
          {finding.targetTicker && (
            <Badge variant="outline" className="text-xs">
              ${finding.targetTicker}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {summaryText}
        </p>
        {rawData && typeof rawData.filingType === 'string' && (
          <Badge variant="outline" className="text-xs">
            {rawData.filingType}
          </Badge>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-2">
            <span>🦞 {finding.agentId}</span>
            <span>{timeAgo(finding.createdAt)}</span>
          </div>
          <a
            href={finding.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            View source
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

// Filter Button Component
function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

// Leaderboard Row Component
function LeaderboardRow({
  agent,
  rank,
}: {
  agent: LeaderboardAgent;
  rank: number;
}) {
  return (
    <TableRow>
      <TableCell
        className={`font-medium ${rank <= 3 ? "text-yellow-500" : ""}`}
      >
        #{rank}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-lg">{agent.avatar}</span>
          <span className="font-medium">{agent.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono">
        {agent.karma.toLocaleString()}
      </TableCell>
      <TableCell className="text-right">{agent.votes}</TableCell>
      <TableCell className="text-right">{agent.findings}</TableCell>
    </TableRow>
  );
}
