import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CircuitBreakerConfig, InterceptedRequest, Policy } from './types';

export class CircuitBreaker {
  private supabase: SupabaseClient;
  private timeoutMs: number;

  constructor(config: CircuitBreakerConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.timeoutMs = config.timeoutMs || 30000; // Default 30s
  }

  async check(prompt: string): Promise<{ allowed: boolean; requestId?: string }> {
    // 1. Fetch active pre-flight policies
    const { data: policies } = await this.supabase
      .from('policies')
      .select('*')
      .eq('type', 'pre-flight');

    if (!policies || policies.length === 0) {
      return { allowed: true };
    }

    // 2. Evaluate policies (simplified for MVP: check for keywords in config)
    for (const policy of policies) {
      const keywords = policy.config.keywords || [];
      const found = keywords.some((kw: string) => prompt.toLowerCase().includes(kw.toLowerCase()));

      if (found) {
        if (policy.action === 'block') {
          await this.logRequest({
            prompt,
            status: 'blocked',
            policy_id: policy.id,
          });
          return { allowed: false };
        }

        if (policy.action === 'human-in-the-loop') {
          const requestId = await this.logRequest({
            prompt,
            status: 'pending',
            policy_id: policy.id,
          });
          
          const approved = await this.waitForApproval(requestId);
          return { allowed: approved, requestId };
        }
      }
    }

    return { allowed: true };
  }

  async guard<T>(promise: Promise<T>, metadata?: any): Promise<T> {
    const result = await promise;
    const responseText = typeof result === 'string' ? result : JSON.stringify(result);

    // Post-flight checks
    const { data: policies } = await this.supabase
      .from('policies')
      .select('*')
      .eq('type', 'post-flight');

    if (policies) {
      for (const policy of policies) {
        const keywords = policy.config.keywords || [];
        const found = keywords.some((kw: string) => responseText.toLowerCase().includes(kw.toLowerCase()));

        if (found) {
          if (policy.action === 'block') {
            throw new Error(`Policy violation: ${policy.name}`);
          }
          // HITL for post-flight could be implemented similarly
        }
      }
    }

    return result;
  }

  private async logRequest(request: InterceptedRequest): Promise<string> {
    const { data, error } = await this.supabase
      .from('intercepted_requests')
      .insert([request])
      .select()
      .single();

    if (error) throw error;
    return data.id;
  }

  private async waitForApproval(requestId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const channel = this.supabase
        .channel(`request_${requestId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'intercepted_requests',
            filter: `id=eq.${requestId}`,
          },
          (payload) => {
            const status = payload.new.status;
            if (status === 'approved') {
              this.supabase.removeChannel(channel);
              resolve(true);
            } else if (status === 'denied') {
              this.supabase.removeChannel(channel);
              resolve(false);
            }
          }
        )
        .subscribe();

      // Timeout logic
      setTimeout(() => {
        this.supabase.removeChannel(channel);
        resolve(false); // Default to deny on timeout
      }, this.timeoutMs);
    });
  }
}

export interface VerifyAgentActionParams {
  sessionId: string;
  toolName: string;
  estimatedCostCents: number;
  payload: Record<string, any>;
}

export interface VerifyAgentActionResult {
  status: 'ALLOWED' | 'BLOCKED' | 'PAUSED';
  reason?: string;
}

export async function verifyAgentAction(
  params: VerifyAgentActionParams
): Promise<VerifyAgentActionResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return {
      status: 'BLOCKED',
      reason: 'Supabase credentials are not configured in environment variables.'
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Fetch active session
  const { data: session, error: sessionError } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('id', params.sessionId)
    .single();

  if (sessionError || !session) {
    return {
      status: 'BLOCKED',
      reason: `Failed to find agent session: ${sessionError?.message || 'Not found'}`
    };
  }

  // 2. Check session status
  if (session.status !== 'active') {
    return {
      status: 'BLOCKED',
      reason: `Agent session is not active. Current status: ${session.status}`
    };
  }

  // 3. Scenario A: Budget limit check
  const newSpend = (session.current_spend_cents || 0) + params.estimatedCostCents;
  if (newSpend > (session.max_budget_cents || 0)) {
    await supabase
      .from('agent_sessions')
      .update({ status: 'blocked' })
      .eq('id', params.sessionId);

    return {
      status: 'BLOCKED',
      reason: `Budget exceeded. Limit: $${((session.max_budget_cents || 0) / 100).toFixed(2)}, Attempted: $${(newSpend / 100).toFixed(2)}`
    };
  }

  // 4. Scenario A: Tool call limit check
  const newToolCalls = (session.current_tool_calls || 0) + 1;
  if (newToolCalls > (session.max_tool_calls || 0)) {
    await supabase
      .from('agent_sessions')
      .update({ status: 'blocked' })
      .eq('id', params.sessionId);

    return {
      status: 'BLOCKED',
      reason: `Tool call limit exceeded. Limit: ${session.max_tool_calls}, Attempted: ${newToolCalls}`
    };
  }

  // 5. Scenario B: SQL Injection check
  const payloadString = JSON.stringify(params.payload).toLowerCase();
  const sqlInjectionPattern = /drop\s+table|delete\s+from|union\s+select|--/;
  const isSqlInjection = params.toolName === 'run_sql' && (
    sqlInjectionPattern.test(payloadString) || payloadString.includes('drop table') || payloadString.includes('delete from')
  );

  if (isSqlInjection) {
    await supabase
      .from('agent_sessions')
      .update({ status: 'paused' })
      .eq('id', params.sessionId);

    // Create a pending review request in intercepted_requests
    await supabase
      .from('intercepted_requests')
      .insert({
        prompt: `Blocked risky action '${params.toolName}' with payload: ${JSON.stringify(params.payload)}`,
        status: 'pending',
        metadata: {
          session_id: params.sessionId,
          tool_name: params.toolName,
          payload: params.payload
        }
      });

    return {
      status: 'PAUSED',
      reason: 'Risky execution pattern detected. Action paused for review.'
    };
  }

  // 6. Update session state if allowed
  const { error: updateError } = await supabase
    .from('agent_sessions')
    .update({
      current_spend_cents: newSpend,
      current_tool_calls: newToolCalls
    })
    .eq('id', params.sessionId);

  if (updateError) {
    return {
      status: 'BLOCKED',
      reason: `Failed to update agent session: ${updateError.message}`
    };
  }

  return {
    status: 'ALLOWED'
  };
}
