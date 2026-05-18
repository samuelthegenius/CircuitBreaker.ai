-- Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- Enable Realtime for api_keys
ALTER PUBLICATION supabase_realtime ADD TABLE api_keys;

-- Enable Row Level Security (RLS)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all access (matching policies and intercepted_requests RLS setup)
CREATE POLICY "Allow all access to api_keys" ON api_keys FOR ALL USING (true);
