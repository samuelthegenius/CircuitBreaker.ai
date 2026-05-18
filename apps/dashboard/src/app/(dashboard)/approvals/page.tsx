'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Clock } from 'lucide-react';

function renderMetadata(request: any) {
  const metadata = request.metadata;
  if (!metadata || Object.keys(metadata).length === 0) {
    return <span className="text-foreground/95">{request.prompt}</span>;
  }

  const toolName = metadata.toolName || metadata.tool_name;
  const args = metadata.arguments || metadata.payload;
  const breachedRule = metadata.breachedRule;

  if (toolName) {
    return (
      <div className="space-y-3.5 py-2 max-w-xl">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-indigo-50/50 border-indigo-100 text-indigo-700 dark:bg-indigo-950/20 dark:border-indigo-900/60 dark:text-indigo-300 font-mono text-[10px] font-bold py-0.5 px-2">
            Tool: {toolName}
          </Badge>
          {breachedRule && (
            <Badge variant="outline" className="bg-amber-50/50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/60 dark:text-amber-300 text-[10px] font-semibold py-0.5 px-2">
              Rule breached: {breachedRule.field} {breachedRule.operator || '=='} {breachedRule.value}
            </Badge>
          )}
          {metadata.session_id && (
            <Badge variant="outline" className="bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900/20 dark:border-slate-800 dark:text-slate-400 font-mono text-[10px]">
              Session: {metadata.session_id.substring(0, 8)}...
            </Badge>
          )}
        </div>
        
        {/* Stylized code grid */}
        <div className="rounded-lg border border-border/40 bg-muted/10 p-3 font-mono text-xs space-y-2 shadow-inner">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5 border-b border-border/20 pb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
            Payload Parameters
          </div>
          <div className="space-y-1.5">
            {args && typeof args === 'object' ? (
              Object.entries(args).map(([key, val]) => {
                const isBreached = breachedRule && breachedRule.field === key;
                return (
                  <div 
                    key={key} 
                    className={`flex flex-col sm:flex-row sm:items-center justify-between py-1 px-2.5 rounded transition-all gap-1 ${
                      isBreached 
                        ? 'bg-amber-500/10 border-l-2 border-amber-500 pl-2 text-amber-900 dark:text-amber-300 font-semibold' 
                        : 'text-foreground/80 hover:bg-muted/40'
                    }`}
                  >
                    <span className="text-muted-foreground font-medium">{key}:</span>
                    <span className="font-mono text-right break-all max-w-[280px] sm:max-w-xs block">
                      {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                    </span>
                  </div>
                );
              })
            ) : (
              <span className="text-muted-foreground italic">No arguments passed</span>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/80 italic leading-relaxed pl-1 border-l border-border/50">
          {request.prompt}
        </p>
      </div>
    );
  }

  // Fallback if metadata is something else
  return (
    <div className="space-y-2 max-w-xl py-1">
      <span className="text-foreground/95 font-medium block leading-snug">{request.prompt}</span>
      <pre className="p-2.5 bg-muted/30 border border-border/30 rounded-lg text-[10px] font-mono overflow-x-auto text-foreground/80 max-h-32">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </div>
  );
}

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    fetchRequests();

    const subscription = supabase
      .channel('pending_requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intercepted_requests' },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  async function fetchRequests() {
    const { data } = await supabase
      .from('intercepted_requests')
      .select('*, policies(name)')
      .order('created_at', { ascending: false });
    if (data) setRequests(data);
  }

  async function updateStatus(id: string, status: 'approved' | 'denied') {
    await supabase
      .from('intercepted_requests')
      .update({ status })
      .eq('id', id);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
          Approvals Queue
        </h1>
        <p className="text-muted-foreground text-base mt-1">
          Review and approve requests that triggered Human-in-the-Loop policies.
        </p>
      </div>

      <Card className="border-border/40 bg-card/65 backdrop-blur-md shadow-lg">
        <CardHeader>
          <CardTitle>Recent Requests</CardTitle>
          <CardDescription>A live feed of all intercepted traffic.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Policy</TableHead>
                <TableHead>Request Scope & Parameters</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id} className="align-top">
                  <TableCell className="pt-4">
                    <Badge variant={
                      request.status === 'approved' ? 'default' :
                      request.status === 'denied' ? 'destructive' :
                      request.status === 'blocked' ? 'destructive' :
                      'secondary'
                    }>
                      {request.status === 'pending' && <Clock className="mr-1 h-3 w-3 inline animate-spin" />}
                      {request.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium pt-4">
                    {request.policies?.name || 'N/A'}
                  </TableCell>
                  <TableCell className="max-w-xl">
                    {renderMetadata(request)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs pt-4 whitespace-nowrap">
                    {new Date(request.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right pt-4">
                    {request.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 text-green-600 border-green-200 hover:bg-green-50 dark:border-green-900/40 dark:hover:bg-green-950/20"
                          onClick={() => updateStatus(request.id, 'approved')}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/20"
                          onClick={() => updateStatus(request.id, 'denied')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No requests found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
