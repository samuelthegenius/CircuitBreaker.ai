'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Clock } from 'lucide-react';

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Approvals Queue</h1>
        <p className="text-muted-foreground">
          Review and approve requests that triggered Human-in-the-Loop policies.
        </p>
      </div>

      <Card>
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
                <TableHead>Prompt</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <Badge variant={
                      request.status === 'approved' ? 'default' :
                      request.status === 'denied' ? 'destructive' :
                      request.status === 'blocked' ? 'destructive' :
                      'secondary'
                    }>
                      {request.status === 'pending' && <Clock className="mr-1 h-3 w-3 inline" />}
                      {request.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {request.policies?.name || 'N/A'}
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {request.prompt}
                  </TableCell>
                  <TableCell>
                    {new Date(request.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {request.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 text-green-600"
                          onClick={() => updateStatus(request.id, 'approved')}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 text-red-600"
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
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
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
