import { createClient } from '@supabase/supabase-js'; // Adjust based on your internal client import
import { verifyAgentAction } from './index'; // Adjust path if your main exports are structured differently

// Initialize your Supabase client with local environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'your-supabase-url';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runSimulation() {
    console.log('🚀 Initializing CircuitBreaker.ai Test Agent Simulation...\n');

    // 1. Establish a new protected agent session in the database
    const { data: session, error: sessionError } = await supabase
        .from('agent_sessions')
        .insert({
            agent_name: 'Simulation-Test-Agent-v1',
            status: 'active',
            max_budget_cents: 100, // Hard limit of $1.00
            current_spend_cents: 0,
            max_tool_calls: 5,     // Hard limit of 5 total actions
            current_tool_calls: 0
        })
        .select()
        .single();

    if (sessionError || !session) {
        console.error('❌ Failed to create test agent session:', sessionError);
        return;
    }

    const sessionId = session.id;
    console.log(`✅ Session created successfully. ID: ${sessionId}`);
    console.log(`📊 Parameters: Max Budget: $1.00 | Max Tool Calls: 5\n`);

    // --- SCENARIO A: TESTING THE BUDGET & ITERATION CIRCUIT BREAKER ---
    console.log('--- Starting Scenario A: Runaway Execution Loop ---');

    for (let i = 1; i <= 7; i++) {
        console.log(`[Loop ${i}/7] Agent trying to execute 'fetch_market_data' (Cost: 20¢)...`);

        const result = await verifyAgentAction({
            sessionId,
            toolName: 'fetch_market_data',
            estimatedCostCents: 20,
            payload: { query: 'crypto_trends_2026' }
        });

        console.log(`➔ Middleware Response Status: **${result.status}**`);
        if (result.status === 'BLOCKED') {
            console.log(`🛑 Circuit Breaker Tripped! Reason: ${result.reason}\n`);
            break;
        }
    }

    // Reset session status to active for the next test scenario if it was blocked
    await supabase
        .from('agent_sessions')
        .update({ status: 'active', current_tool_calls: 0, current_spend_cents: 0 })
        .eq('id', sessionId);


    // --- SCENARIO B: TESTING MALICIOUS PROMPT INJECTION (HITL) ---
    console.log('--- Starting Scenario B: Malicious Payload Injection ---');
    console.log(`⚠️ Agent attempting destructive SQL execution...`);

    const injectionResult = await verifyAgentAction({
        sessionId,
        toolName: 'run_sql',
        estimatedCostCents: 5,
        payload: { sql: 'DROP TABLE users; --' }
    });

    console.log(`➔ Middleware Response Status: **${injectionResult.status}**`);
    if (injectionResult.status === 'PAUSED') {
        console.log(`⏳ Success! Execution frozen. Check your /approvals dashboard to resolve.`);
    }
}

runSimulation().catch(console.error);