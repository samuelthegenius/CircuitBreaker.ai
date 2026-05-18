export type PolicyType = 'pre-flight' | 'post-flight';
export type ActionType = 'block' | 'allow' | 'human-in-the-loop';
export type RequestStatus = 'pending' | 'approved' | 'denied' | 'blocked' | 'allowed';

export interface Policy {
  id: string;
  name: string;
  type: PolicyType;
  action: ActionType;
  config: Record<string, any>;
}

export interface InterceptedRequest {
  id?: string;
  created_at?: string;
  prompt: string;
  response?: string;
  status: RequestStatus;
  policy_id?: string;
  metadata?: Record<string, any>;
}

export interface CircuitBreakerConfig {
  supabaseUrl: string;
  supabaseKey: string;
  timeoutMs?: number;
}
