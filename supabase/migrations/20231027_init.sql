-- Create policies table
CREATE TABLE IF NOT EXISTS policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('pre-flight', 'post-flight')),
    action TEXT NOT NULL CHECK (action IN ('block', 'allow', 'human-in-the-loop')),
    config JSONB DEFAULT '{}'::jsonb
);

-- Create intercepted_requests table
CREATE TABLE IF NOT EXISTS intercepted_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    prompt TEXT NOT NULL,
    response TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'blocked', 'allowed')),
    policy_id UUID REFERENCES policies(id),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable Realtime for intercepted_requests
ALTER PUBLICATION supabase_realtime ADD TABLE intercepted_requests;

-- Basic RLS (For MVP, we'll allow all for now, but in production this should be tightened)
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE intercepted_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to policies" ON policies FOR ALL USING (true);
CREATE POLICY "Allow all access to intercepted_requests" ON intercepted_requests FOR ALL USING (true);

-- Insert some sample policies
INSERT INTO policies (name, type, action, config) VALUES
('PII Filter', 'pre-flight', 'block', '{"keywords": ["password", "ssn", "credit card"]}'),
('Executive Approval', 'pre-flight', 'human-in-the-loop', '{"keywords": ["budget", "strategy", "roadmap"]}'),
('Safety Check', 'post-flight', 'block', '{"keywords": ["harmful", "toxic"]}');
