import { createClient } from '@supabase/supabase-js';
import { CircuitBreaker, verifyAgentAction } from './index';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeAdvancedTest() {
    const breaker = new CircuitBreaker({ supabaseUrl, supabaseKey, timeoutMs: 30000 });

    console.log('⚡ Starting CircuitBreaker.ai Advanced Parameter Verification...\n');

    // --- SCENARIO 1: STRUCTURED PAYLOAD CHECKS ---
    console.log('💎 Scenario 1: Dispatching high-value structured tool transaction...');
    const toolCheck = await breaker.check('transfer_funds', {
        recipient_id: 'usr_94821',
        amount: 4500,
        currency: 'USD',
        memo: 'Automated warehouse inventory restock payout'
    });

    console.log(`➔ Result: ${toolCheck.allowed ? '🟢 TRANSACTION CLEARED' : '🔴 PIPELINE CAPTURED BY CIRCUIT BREAKER'}`);
    console.log(`   Request Entry ID: ${toolCheck.requestId}\n`);


    // --- SCENARIO 2: LIVE SESSION STATE BUDGETS ---
    console.log('🔒 Scenario 2: Seeding dynamic record for Lifecycle Protection test...');

    // 1. Create a real session to generate a valid relational UUID matching constraints
    const { data: liveSession, error: seedError } = await supabase
        .from('agent_sessions')
        .insert({
            agent_name: 'Production-Trading-Agent',
            status: 'active',
            max_budget_cents: 500,  // $5.00 Limit
            current_spend_cents: 0,
            max_tool_calls: 10,
            current_tool_calls: 0
        })
        .select()
        .single();

    if (seedError || !liveSession) {
        console.error('❌ Failed to seed temporary validation record:', seedError?.message);
        return;
    }

    console.log(`   Generated Live Test Session ID: ${liveSession.id}`);
    console.log('   Checking safety metrics against real-time relational limits...');

    // 2. Invoke verification with the valid generated row ID
    const sessionResult = await verifyAgentAction({
        sessionId: liveSession.id,
        toolName: 'run_sql',
        estimatedCostCents: 45, // Cost fits within $5.00 allowance
        payload: { query: 'SELECT name FROM clients LIMIT 5;' }
    });

    console.log(`➔ Session Validator Response Status: **${sessionResult.status}**`);
    if (sessionResult.reason) {
        console.log(`   Notice details: ${sessionResult.reason}`);
    } else {
        console.log('   🟢 SUCCESS: Session budgets validated and resource balances logged cleanly!');
    }
}

executeAdvancedTest().catch(console.error);