-- Create agent_sessions table
CREATE TABLE IF NOT EXISTS agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    agent_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'blocked', 'paused')),
    max_budget_cents INTEGER NOT NULL DEFAULT 0,
    current_spend_cents INTEGER NOT NULL DEFAULT 0,
    max_tool_calls INTEGER NOT NULL DEFAULT 0,
    current_tool_calls INTEGER NOT NULL DEFAULT 0
);

-- Enable Realtime for agent_sessions (optional, but good for dashboard auto-updates)
ALTER PUBLICATION supabase_realtime ADD TABLE agent_sessions;

-- Enable Row Level Security (RLS)
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all access (matching policies and intercepted_requests RLS setup)
CREATE POLICY "Allow all access to agent_sessions" ON agent_sessions FOR ALL USING (true);
