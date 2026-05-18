import { CircuitBreaker } from './index';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root or local folder
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing Supabase credentials in your environment variables.');
    process.exit(1);
}

async function testDrive() {
    // Instantiate using your strict constructor definition
    const breaker = new CircuitBreaker({
        supabaseUrl,
        supabaseKey,
        timeoutMs: 45000 // Give yourself 45 seconds to click the dashboard button
    });

    console.log('🚀 CircuitBreaker.ai live framework verification testing...\n');

    // --- CASE 1: CLEAN TRAFFIC PASS-THROUGH ---
    console.log('🧪 Test 1: Testing clean user intent...');
    const test1 = await breaker.check('What are the core benefits of building a monorepo framework?');
    console.log(`➔ Result: ${test1.allowed ? '✅ ALLOWED' : '❌ BLOCKED'}\n`);


    // --- CASE 2: HARD PRE-FLIGHT POLICY BLOCK ---
    console.log('🧪 Test 2: Simulating PII violation payload (Should block instantly)...');
    // Triggering keyword rule tracking "password" inside your database seed configuration
    const test2 = await breaker.check('Can you help me retrieve my forgotten password for the admin node?');
    console.log(`➔ Result: ${test2.allowed ? '✅ ALLOWED' : '❌ BLOCKED (Instant Guard Triggered)'}\n`);


    // --- CASE 3: ASYNC HUMAN-IN-THE-LOOP INTERVENTION ---
    console.log('🧪 Test 3: Triggering Human-in-the-Loop context (This will pause execution)...');
    console.log('⚠️ Prompt contains keyword: "budget". System is creating a live WebSocket holding channel.');
    console.log('👉 Head over to http://localhost:3000/approvals to view the incident card and click Approve or Deny.');

    // This triggers your internal waitForApproval promise loop via Supabase realtime channels
    const test3 = await breaker.check('Let us review our operational roadmap and scale up the server budget.');

    console.log(`\n➔ Async Realtime Core Resolved: ${test3.allowed ? '🟢 APPROVED BY HUMAN OPERATOR' : '🔴 DENIED BY HUMAN OPERATOR'}\n`);

    // --- CASE 4: STRUCTURED B2B TOOL EXECUTION ARGUMENTS CHECK ---
    console.log('🧪 Test 4: Testing structured tool arguments check...');
    console.log('Seeding a dynamic rule if not exists: Target Tool: "transfer_funds", Field: "amount", Threshold: > 1000, Action: human-in-the-loop...');
    
    // Dynamically insert high-fidelity test rule
    const { data: existingRule } = await breaker['supabase']
      .from('policies')
      .select('*')
      .eq('name', 'B2B Large Fund Transfer Guard');
      
    if (!existingRule || existingRule.length === 0) {
      await breaker['supabase']
        .from('policies')
        .insert([{
          name: 'B2B Large Fund Transfer Guard',
          type: 'pre-flight',
          action: 'human-in-the-loop',
          config: {
            toolName: 'transfer_funds',
            field: 'amount',
            operator: '>',
            value: 1000
          }
        }]);
      console.log('✅ Large Fund Transfer policy seeded successfully.');
    }

    console.log('⚠️ Simulating B2B tool execution: transfer_funds with arguments: { amount: 1500, recipient: "Enterprise Inc" }');
    console.log('👉 Head over to http://localhost:3000/approvals to see the structured parameter grid and click Approve or Deny.');

    const test4 = await breaker.check('transfer_funds', { amount: 1500, recipient: 'Enterprise Inc' });
    console.log(`\n➔ Async Realtime Parameter Core Resolved: ${test4.allowed ? '🟢 APPROVED BY HUMAN OPERATOR' : '🔴 DENIED BY HUMAN OPERATOR'}`);
}

testDrive().catch(console.error);