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
