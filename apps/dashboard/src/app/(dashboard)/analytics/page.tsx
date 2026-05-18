'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Activity, 
  TrendingUp, 
  DollarSign, 
  Clock, 
  Zap, 
  Terminal, 
  RefreshCw, 
  Lock
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';

interface MetricStats {
  totalSteps: number;
  threatsNeutered: number;
  activeSessions: number;
  capitalSaved: number;
}

interface ChartGroup {
  date: string;
  allowed: number;
  blocked: number;
  rawDate: Date;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<MetricStats>({
    totalSteps: 0,
    threatsNeutered: 0,
    activeSessions: 0,
    capitalSaved: 0
  });

  const [chartData, setChartData] = useState<ChartGroup[]>([]);
  const [recentRequests, setRecentRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Group requests by date (seeding past 7 days chronologically) with a fixed 'en-US' locale
  function groupRequestsByDate(requests: any[]): ChartGroup[] {
    const groups: Record<string, ChartGroup> = {};
    
    // Seed last 7 days to ensure a clean interactive graph layout
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      groups[dateStr] = {
        date: dateStr,
        allowed: 0,
        blocked: 0,
        rawDate: d
      };
    }

    // Populate actual counts from DB
    requests.forEach((req) => {
      const d = new Date(req.created_at);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      // Initialize if outside of standard window
      if (!groups[dateStr]) {
        groups[dateStr] = {
          date: dateStr,
          allowed: 0,
          blocked: 0,
          rawDate: d
        };
      }
      
      if (req.status === 'allowed' || req.status === 'approved') {
        groups[dateStr].allowed++;
      } else if (req.status === 'blocked' || req.status === 'denied' || req.status === 'pending') {
        groups[dateStr].blocked++;
      }
    });
    
    return Object.values(groups).sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
  }

  // Primary data fetching and aggregation engine
  async function fetchAnalyticsData() {
    try {
      setIsRefreshing(true);

      // Fetch all requests
      const { data: requests, error: requestsError } = await supabase
        .from('intercepted_requests')
        .select('*, policies(name)')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;

      // Fetch all agent sessions
      const { data: sessions, error: sessionsError } = await supabase
        .from('agent_sessions')
        .select('*');

      if (sessionsError) throw sessionsError;

      const safeRequests = requests || [];
      const safeSessions = sessions || [];

      // 1. Total Inspected Steps
      const totalSteps = safeRequests.length;

      // 2. Threats Neutered (blocked or denied)
      const threatsNeutered = safeRequests.filter(
        r => r.status === 'blocked' || r.status === 'denied'
      ).length;

      // 3. Active Guarded Sessions
      const activeSessions = safeSessions.filter(
        s => s.status === 'active'
      ).length;

      // 4. Estimated Capital Saved
      // A: Request level capital saved (transaction amount in blocked/denied requests)
      let requestCapitalSaved = 0;
      safeRequests.forEach(req => {
        if (req.status === 'blocked' || req.status === 'denied') {
          const meta = req.metadata || {};
          const args = meta.arguments || meta.payload || {};
          
          let amt = 0;
          if (typeof args.amount === 'number') {
            amt = args.amount;
          } else if (typeof args.amount === 'string') {
            const parsed = parseFloat(args.amount);
            if (!isNaN(parsed)) amt = parsed;
          }

          if (amt > 0) {
            requestCapitalSaved += amt;
          }

          let costCents = 0;
          if (typeof args.estimatedCostCents === 'number') {
            costCents = args.estimatedCostCents;
          } else if (typeof args.estimated_cost_cents === 'number') {
            costCents = args.estimated_cost_cents;
          }
          if (costCents > 0) {
            requestCapitalSaved += costCents / 100;
          }
        }
      });

      // B: Session level capital saved (remaining frozen budgets in blocked sessions)
      let sessionCapitalSaved = 0;
      safeSessions.forEach(session => {
        if (session.status === 'blocked') {
          const maxBudget = session.max_budget_cents || 0;
          const currentSpend = session.current_spend_cents || 0;
          const remaining = Math.max(0, maxBudget - currentSpend);
          sessionCapitalSaved += remaining / 100;
        }
      });

      const capitalSaved = requestCapitalSaved + sessionCapitalSaved;

      setStats({
        totalSteps,
        threatsNeutered,
        activeSessions,
        capitalSaved
      });

      // Format chart series
      const chartGroups = groupRequestsByDate(safeRequests);
      setChartData(chartGroups);

      // Extract 5 most recent requests
      setRecentRequests(safeRequests.slice(0, 5));

    } catch (err) {
      console.error('Error fetching analytics command center data:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }

  // Subscribe to real-time events for live updates
  useEffect(() => {
    setIsMounted(true);
    fetchAnalyticsData();

    const requestsChannel = supabase
      .channel('analytics_requests_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intercepted_requests' },
        () => {
          fetchAnalyticsData();
        }
      )
      .subscribe();

    const sessionsChannel = supabase
      .channel('analytics_sessions_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_sessions' },
        () => {
          fetchAnalyticsData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(sessionsChannel);
    };
  }, []);

  // Format USD Currency cleanly
  const formatUSD = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  // Modern HTML context generator for trace logs
  function renderRequestFeedContext(request: any) {
    const meta = request.metadata || {};
    const toolName = meta.toolName || meta.tool_name;
    
    if (toolName) {
      return (
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono bg-indigo-950/20 text-indigo-300 border-indigo-900/60 text-[10px] py-0.5 px-2">
              Tool: {toolName}
            </Badge>
            {meta.session_id && (
              <span className="text-[10px] text-muted-foreground font-mono">
                Session: {meta.session_id.substring(0, 8)}...
              </span>
            )}
          </div>
          <span className="text-muted-foreground/90 font-mono text-[11px] line-clamp-1 break-all italic pl-1 border-l border-border/40 mt-1 max-w-[500px] block">
            {request.prompt}
          </span>
        </div>
      );
    }

    return (
      <span className="text-muted-foreground text-xs line-clamp-1 break-all max-w-[500px]">
        {request.prompt}
      </span>
    );
  }

  // Premium status color-coded badges
  function getStatusBadge(status: string) {
    switch (status) {
      case 'blocked':
      case 'denied':
        return (
          <Badge className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold capitalize flex items-center gap-1.5 w-fit shadow-sm shadow-red-500/5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
            {status}
          </Badge>
        );
      case 'approved':
        return (
          <Badge className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold capitalize flex items-center gap-1.5 w-fit shadow-sm shadow-emerald-500/5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            {status}
          </Badge>
        );
      case 'allowed':
        return (
          <Badge className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold capitalize flex items-center gap-1.5 w-fit shadow-sm shadow-blue-500/5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
            {status}
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold capitalize flex items-center gap-1.5 w-fit shadow-sm shadow-amber-500/5">
            <Clock className="w-3 h-3 text-amber-400 animate-spin" />
            {status}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold capitalize flex items-center gap-1.5 w-fit">
            {status}
          </Badge>
        );
    }
  }

  // Premium glassmorphic custom chart tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-950/90 border border-slate-800 p-3.5 rounded-xl shadow-2xl backdrop-blur-md font-mono text-[11px] text-slate-200 space-y-1.5 border-slate-700/40">
          <p className="font-bold border-b border-slate-800 pb-1 text-slate-400 mb-1.5">{label}</p>
          {payload.map((entry: any) => (
            <div key={entry.name} className="flex justify-between items-center gap-5">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }}></span>
                {entry.name}:
              </span>
              <span className="font-bold text-foreground">{entry.value} steps</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
            Executive Analytics Command Center
          </h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            Monitor real-time threat captures, active agent session budgets, and security ROI statistics.
          </p>
        </div>
        <div>
          <Button
            id="btn-refresh-analytics"
            size="sm"
            variant="outline"
            disabled={isRefreshing}
            onClick={fetchAnalyticsData}
            className="font-mono text-xs border-border/40 hover:bg-muted/40 transition-all flex items-center gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Syncing...' : 'Sync Telemetry'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin" />
          <p className="text-muted-foreground text-sm font-mono animate-pulse">Establishing real-time telemetry channel...</p>
        </div>
      ) : (
        <>
          {/* CORE METRIC SUMMARY CARDS */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Total Inspected Steps */}
            <Card 
              id="card-metric-total-steps"
              className="group border-border/40 bg-card/65 backdrop-blur-md hover:border-indigo-500/40 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-indigo-500 to-cyan-500"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Inspected Steps</CardTitle>
                <Activity className="h-4.5 w-4.5 text-indigo-400 group-hover:scale-110 transition-transform" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black tracking-tight text-foreground group-hover:text-indigo-400 transition-colors">
                  {stats.totalSteps}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono mt-1 flex items-center gap-1">
                  <span className="text-indigo-400">●</span> Live agent telemetry active
                </p>
              </CardContent>
            </Card>

            {/* Threats Neutered */}
            <Card 
              id="card-metric-threats-neutered"
              className="group border-border/40 bg-card/65 backdrop-blur-md hover:border-red-500/40 hover:shadow-[0_0_20px_rgba(239,68,68,0.15)] transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-red-500 to-rose-500"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Threats Neutered</CardTitle>
                <Shield className="h-4.5 w-4.5 text-red-400 group-hover:scale-110 transition-transform" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black tracking-tight text-foreground group-hover:text-red-400 transition-colors">
                  {stats.threatsNeutered}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono mt-1 flex items-center gap-1">
                  <span className="text-red-400">●</span> Attacks & breaches blocked
                </p>
              </CardContent>
            </Card>

            {/* Active Guarded Sessions */}
            <Card 
              id="card-metric-active-sessions"
              className="group border-border/40 bg-card/65 backdrop-blur-md hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-emerald-500 to-teal-500"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Guarded Sessions</CardTitle>
                <Lock className="h-4.5 w-4.5 text-emerald-400 group-hover:scale-110 transition-transform" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black tracking-tight text-foreground group-hover:text-emerald-400 transition-colors">
                  {stats.activeSessions}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono mt-1 flex items-center gap-1">
                  <span className="text-emerald-400">●</span> Active sandbox containers
                </p>
              </CardContent>
            </Card>

            {/* Estimated Capital Saved */}
            <Card 
              id="card-metric-capital-saved"
              className="group border-border/40 bg-card/65 backdrop-blur-md hover:border-amber-500/40 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-amber-500 to-yellow-500"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estimated Capital Saved</CardTitle>
                <DollarSign className="h-4.5 w-4.5 text-amber-400 group-hover:scale-110 transition-transform" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black tracking-tight text-foreground group-hover:text-amber-400 transition-colors">
                  {formatUSD(stats.capitalSaved)}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono mt-1 flex items-center gap-1">
                  <span className="text-amber-400">●</span> Preserved budget value
                </p>
              </CardContent>
            </Card>
          </div>

          {/* INCIDENT THREAT CHART */}
          <Card className="border-border/40 bg-card/65 backdrop-blur-md shadow-xl overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-indigo-500" />
                    Incident Threat Analysis
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Visualizing historical agent traffic: Safe allowed steps vs blocked or pending anomalies.
                  </CardDescription>
                </div>
                <div className="flex gap-4 font-mono text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500"></span>
                    <span>Allowed Traffic</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
                    <span>Security Anomalies</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 px-2 sm:px-6">
              <div className="h-[320px] w-full">
                {isMounted ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorAllowed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="rgb(99, 102, 241)" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="rgb(99, 102, 241)" stopOpacity={0.0}/>
                        </linearGradient>
                        <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="rgb(244, 63, 94)" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="rgb(244, 63, 94)" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        stroke="rgba(255,255,255,0.3)" 
                        fontSize={10} 
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                        fontFamily="monospace"
                      />
                      <YAxis 
                        stroke="rgba(255,255,255,0.3)" 
                        fontSize={10} 
                        tickLine={false}
                        axisLine={false}
                        dx={-5}
                        fontFamily="monospace"
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area 
                        type="monotone" 
                        dataKey="allowed" 
                        name="Allowed Traffic"
                        stroke="rgb(99, 102, 241)" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorAllowed)" 
                        stackId="1"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="blocked" 
                        name="Security Anomalies"
                        stroke="rgb(244, 63, 94)" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorBlocked)" 
                        stackId="1"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full bg-slate-900/10 animate-pulse rounded-lg border border-dashed border-border flex items-center justify-center font-mono text-xs text-muted-foreground">
                    Initializing graphics layer...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* REAL-TIME EVENT STREAM FEED */}
          <Card className="border-border/40 bg-card/65 backdrop-blur-md shadow-xl overflow-hidden">
            <CardHeader className="border-b border-border/30 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Terminal className="h-5 w-5 text-indigo-400" />
                    Live Event Stream Feed
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Instantly sliding in raw developer executions, agent script iterations, and security checks.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="animate-pulse bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-[10px] font-mono py-0.5 px-2">
                  ⚡ Live Connection Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table id="table-event-stream">
                  <TableHeader className="bg-muted/15 border-b border-border/25">
                    <TableRow>
                      <TableHead className="w-[120px] font-mono text-[10px] uppercase tracking-wider text-muted-foreground py-3 pl-6">Resolution</TableHead>
                      <TableHead className="w-[180px] font-mono text-[10px] uppercase tracking-wider text-muted-foreground py-3">Active Policy</TableHead>
                      <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground py-3">Initial Context & Tool Traces</TableHead>
                      <TableHead className="w-[180px] font-mono text-[10px] uppercase tracking-wider text-muted-foreground py-3 pr-6 text-right">Captured At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentRequests.map((request) => (
                      <TableRow 
                        key={request.id} 
                        id={`event-row-${request.id}`}
                        className="align-top border-b border-border/20 hover:bg-muted/5 transition-all duration-200 animate-in fade-in slide-in-from-top-3 duration-500"
                      >
                        {/* Status Badge */}
                        <TableCell className="py-4 pl-6 align-middle">
                          {getStatusBadge(request.status)}
                        </TableCell>
                        
                        {/* Policy Name */}
                        <TableCell className="py-4 font-semibold text-xs text-foreground align-middle">
                          {request.policies?.name || (
                            <span className="text-muted-foreground/60 font-mono text-[10px] italic">Global Guardrail</span>
                          )}
                        </TableCell>
                        
                        {/* Prompt context/tool trace */}
                        <TableCell className="py-4 pr-4 align-middle">
                          {renderRequestFeedContext(request)}
                        </TableCell>
                        
                        {/* Timestamp */}
                        <TableCell className="py-4 pr-6 text-right text-muted-foreground font-mono text-[10.5px] align-middle whitespace-nowrap">
                          {new Date(request.created_at).toLocaleString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                          })}
                          <span className="text-muted-foreground/45 text-[9px] block">
                            {new Date(request.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {recentRequests.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground text-sm font-mono">
                          No active events inspected. Ready for agent script executions...
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
