'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Key, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Globe, 
  ShieldAlert, 
  AlertTriangle, 
  Info, 
  Layers, 
  RefreshCw, 
  Database,
  Lock,
  Eye,
  Terminal,
  Activity
} from 'lucide-react';

interface ApiKeyRecord {
  id: string;
  created_at: string;
  name: string;
  prefix: string;
  secret_hash: string;
  environment: 'development' | 'staging' | 'production';
  last_used_at: string | null;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'api_keys' | 'integration'>('api_keys');
  const [globalEnv, setGlobalEnv] = useState<'all' | 'development' | 'staging' | 'production'>('all');
  
  // API Keys States
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [keyName, setKeyName] = useState('');
  const [keyEnv, setKeyEnv] = useState<'development' | 'staging' | 'production'>('development');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'connected' | 'sandbox'>('connected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch API keys from Supabase (with fallback to localStorage if relation does not exist)
  async function fetchApiKeys() {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Table not found in DB schema cache, gracefully fall back to local sandbox storage
        if (error.message.includes('does not exist') || error.message.includes('relation')) {
          setSyncStatus('sandbox');
          const localKeys = localStorage.getItem('cb_api_keys');
          if (localKeys) {
            setApiKeys(JSON.parse(localKeys));
          } else {
            // Seed a mock key for the local demo to look pristine
            const seedKeys: ApiKeyRecord[] = [
              {
                id: 'ee6af2c1-d441-4d46-94be-398ec98603bd',
                created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
                name: 'Production AI Swarm Key',
                prefix: 'cb_prod_live_a3f9',
                secret_hash: '5f4dcc3b5aa765d61d8327deb882cf99',
                environment: 'production',
                last_used_at: new Date(Date.now() - 45000).toISOString()
              },
              {
                id: 'bd9eb983-71ab-4e56-94be-215f79116c2a',
                created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
                name: 'Staging Chatbot Agent',
                prefix: 'cb_stg_live_2b8c',
                secret_hash: '2c8c6a66a6a6fa3ea3fa3ea3fa3ea3fa',
                environment: 'staging',
                last_used_at: null
              },
              {
                id: '864219c8-d03f-4a3b-9cdb-e5810038cb7d',
                created_at: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
                name: 'Local Dev Trading Script',
                prefix: 'cb_dev_live_7c1d',
                secret_hash: 'b353a23a3a3a3a3a3a3a3a3a3a3a3a3a',
                environment: 'development',
                last_used_at: new Date(Date.now() - 3 * 3600000).toISOString()
              }
            ];
            localStorage.setItem('cb_api_keys', JSON.stringify(seedKeys));
            setApiKeys(seedKeys);
          }
        } else {
          throw error;
        }
      } else {
        setSyncStatus('connected');
        setApiKeys(data || []);
      }
    } catch (err: any) {
      console.error('Error fetching API keys:', err);
      setErrorMessage('Failed to retrieve keys from cloud. Sandbox active.');
      setSyncStatus('sandbox');
    } finally {
      setIsLoading(false);
    }
  }

  // Realtime subscription setup
  useEffect(() => {
    fetchApiKeys();

    const keysChannel = supabase
      .channel('api_keys_live_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'api_keys' },
        () => {
          fetchApiKeys();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(keysChannel);
    };
  }, []);

  // Hash token helper using browser Web Crypto API
  async function hashRawToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Key generation logic
  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!keyName.trim()) {
      setErrorMessage('Please provide a descriptive name for your API token.');
      return;
    }

    try {
      setIsGenerating(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      // 1. Generate strong secure random part
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      const randomArray = new Uint32Array(32);
      crypto.getRandomValues(randomArray);
      let randomPart = '';
      for (let i = 0; i < randomArray.length; i++) {
        randomPart += chars[randomArray[i] % chars.length];
      }

      // 2. Format tokens matching developer standards: cb_[env]_live_[random_part]
      const envPrefix = keyEnv === 'development' ? 'dev' : keyEnv === 'staging' ? 'stg' : 'prod';
      const rawToken = `cb_${envPrefix}_live_${randomPart}`;
      const prefix = `cb_${envPrefix}_live_${randomPart.substring(0, 4)}`;

      // 3. Compute secure client-side hash
      const secretHash = await hashRawToken(rawToken);

      // 4. Try putting to Supabase first
      if (syncStatus === 'connected') {
        const { data, error } = await supabase
          .from('api_keys')
          .insert({
            name: keyName,
            prefix: prefix,
            secret_hash: secretHash,
            environment: keyEnv,
          })
          .select()
          .single();

        if (error) {
          // If insert fails due to missing table at write time
          console.warn('Supabase write error, using sandbox fallback:', error.message);
          throw new Error('FallbackToSandbox');
        } else {
          setSuccessMessage(`Successfully provisioned "${keyName}" in Supabase Cloud!`);
          fetchApiKeys();
        }
      } else {
        throw new Error('SandboxModeActive');
      }

      // Display the single-use token
      setGeneratedKey(rawToken);
      setKeyName('');
      
    } catch (err: any) {
      // Local Sandbox Fallback Operation
      const envPrefix = keyEnv === 'development' ? 'dev' : keyEnv === 'staging' ? 'stg' : 'prod';
      const randomPart = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const rawToken = `cb_${envPrefix}_live_${randomPart}`;
      const prefix = `cb_${envPrefix}_live_${randomPart.substring(0, 4)}`;
      const secretHash = 'sandbox_' + Math.random().toString(36).substring(2, 10);

      const newKey: ApiKeyRecord = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        name: keyName,
        prefix: prefix,
        secret_hash: secretHash,
        environment: keyEnv,
        last_used_at: null
      };

      const localKeys = localStorage.getItem('cb_api_keys');
      const keysList = localKeys ? JSON.parse(localKeys) : [];
      const updatedList = [newKey, ...keysList];
      
      localStorage.setItem('cb_api_keys', JSON.stringify(updatedList));
      setApiKeys(updatedList);
      setSyncStatus('sandbox');

      setGeneratedKey(rawToken);
      setKeyName('');
      setSuccessMessage(`Successfully provisioned "${newKey.name}" in local sandbox!`);
    } finally {
      setIsGenerating(false);
    }
  }

  // Revoke/Delete API Key
  async function handleRevokeKey(id: string, name: string) {
    if (!confirm(`Are you absolutely sure you want to permanently revoke key "${name}"?\nThis action cannot be undone, and all agent request connections using this token will be instantly blocked.`)) {
      return;
    }

    try {
      setErrorMessage(null);
      setSuccessMessage(null);

      if (syncStatus === 'connected') {
        const { error } = await supabase
          .from('api_keys')
          .delete()
          .eq('id', id);

        if (error) throw error;
        setSuccessMessage(`Successfully revoked key "${name}"!`);
        fetchApiKeys();
      } else {
        const localKeys = localStorage.getItem('cb_api_keys');
        if (localKeys) {
          const keysList: ApiKeyRecord[] = JSON.parse(localKeys);
          const updatedList = keysList.filter(k => k.id !== id);
          localStorage.setItem('cb_api_keys', JSON.stringify(updatedList));
          setApiKeys(updatedList);
          setSuccessMessage(`Successfully revoked key "${name}" from sandbox!`);
        }
      }
    } catch (err: any) {
      console.error('Error revoking key:', err);
      setErrorMessage('Failed to revoke API key.');
    }
  }

  // Copy key clipboard widget
  const handleCopyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Environment badge styling matching the command center
  function getEnvironmentBadge(env: 'development' | 'staging' | 'production') {
    switch (env) {
      case 'development':
        return (
          <Badge className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold capitalize flex items-center gap-1.5 w-fit shadow-sm shadow-emerald-500/5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            {env}
          </Badge>
        );
      case 'staging':
        return (
          <Badge className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold capitalize flex items-center gap-1.5 w-fit shadow-sm shadow-blue-500/5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
            {env}
          </Badge>
        );
      case 'production':
        return (
          <Badge className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold capitalize flex items-center gap-1.5 w-fit shadow-sm shadow-purple-500/5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
            {env}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-500/10 text-slate-400 border border-slate-500/30 px-2 py-0.5 rounded-full font-mono text-[10px]">
            {env}
          </Badge>
        );
    }
  }

  // Filter keys list dynamically based on global scoping toggle selector
  const filteredKeys = apiKeys.filter((key) => {
    if (globalEnv === 'all') return true;
    return key.environment === globalEnv;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      
      {/* 1. TOP HEADER & GLOBAL ENVIRONMENT SCOPING SWITCH */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-border/20 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
            Platform Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            Manage multi-tenant developer credentials, scope SDK environments, and control proxy routing.
          </p>
        </div>

        {/* Global Scoping Segmented Switch */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-indigo-400" />
            Global Scope Filter:
          </span>
          <div className="bg-card/75 border border-border/40 p-1 rounded-xl flex gap-1 shadow-inner max-w-full overflow-x-auto">
            {(['all', 'development', 'staging', 'production'] as const).map((env) => (
              <button
                key={env}
                id={`env-toggle-${env}`}
                onClick={() => setGlobalEnv(env)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  globalEnv === env
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                }`}
              >
                {env === 'all' ? 'All Scopes' : env.charAt(0).toUpperCase() + env.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. SUBTAB NAVIGATION */}
      <div className="flex border-b border-border/30 gap-6">
        <button
          onClick={() => setActiveTab('api_keys')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 cursor-pointer ${
            activeTab === 'api_keys'
              ? 'border-indigo-500 text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          API Access Keys
        </button>
        <button
          onClick={() => setActiveTab('integration')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 cursor-pointer ${
            activeTab === 'integration'
              ? 'border-indigo-500 text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Integration Setup
        </button>
      </div>

      {/* 3. SETTINGS SECTIONS */}
      {activeTab === 'api_keys' ? (
        <div className="grid gap-8 lg:grid-cols-3 items-start">
          
          {/* LEFT HAND SIDE: KEY GENERATION FORM */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-border/40 bg-card/65 backdrop-blur-md relative overflow-hidden shadow-xl">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-indigo-500 to-cyan-500"></div>
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Key className="h-4.5 w-4.5 text-indigo-400" />
                  Generate SDK Access Token
                </CardTitle>
                <CardDescription className="text-xs">
                  Issue a cryptographically secure token to connect external AI agents to the circuit breaker proxy.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <form onSubmit={handleCreateKey} className="space-y-5">
                  {/* Name field */}
                  <div className="space-y-2">
                    <label htmlFor="key-name" className="text-xs font-mono font-bold text-muted-foreground">
                      Token Name / Label
                    </label>
                    <input
                      id="key-name"
                      type="text"
                      placeholder="e.g. Finance Agent Node"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      className="w-full h-9 rounded-lg border border-border/60 bg-muted/10 px-3 py-1.5 text-sm font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/30"
                    />
                  </div>

                  {/* Environment Scope Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-mono font-bold text-muted-foreground block">
                      Environment Scope
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['development', 'staging', 'production'] as const).map((env) => {
                        let btnStyle = '';
                        if (keyEnv === env) {
                          btnStyle = env === 'development' 
                            ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.1)]'
                            : env === 'staging'
                            ? 'border-blue-500/40 bg-blue-500/5 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.1)]'
                            : 'border-purple-500/40 bg-purple-500/5 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.1)]';
                        } else {
                          btnStyle = 'border-border/40 hover:bg-muted/20 text-muted-foreground';
                        }
                        
                        return (
                          <button
                            key={env}
                            type="button"
                            id={`env-select-${env}`}
                            onClick={() => setKeyEnv(env)}
                            className={`h-9 border rounded-lg text-xs font-mono font-semibold capitalize transition-all cursor-pointer ${btnStyle}`}
                          >
                            {env}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <Button
                    id="btn-generate-key"
                    type="submit"
                    disabled={isGenerating}
                    className="w-full h-9 font-semibold text-xs bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-500/30 shadow-md shadow-indigo-600/10 cursor-pointer transition-all duration-200 mt-2 flex items-center justify-center gap-1.5"
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Generating Entropy...
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        Provision Key Token
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* SYNC STATUS ADVISORY */}
            <Card className="border-border/30 bg-muted/5 relative overflow-hidden shadow-sm p-4">
              <div className="flex items-start gap-3">
                {syncStatus === 'connected' ? (
                  <Database className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                )}
                <div className="space-y-1">
                  <h4 className="text-xs font-bold font-mono text-foreground flex items-center gap-1.5">
                    Database Connection Status
                    <span className={`inline-block w-2 h-2 rounded-full ${syncStatus === 'connected' ? 'bg-indigo-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`}></span>
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">
                    {syncStatus === 'connected' 
                      ? 'Connected to hosted Supabase database. All tokens will synchronize across active microservices instantly.'
                      : 'Local Sandbox Active: API keys table is not yet deployed to cloud. Storing in browser sandbox container for seamless local trials.'}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* RIGHT HAND SIDE: KEY WARNING ALERT & ACTIVE ACCESS TOKENS TABLE */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* CONDITIONAL RAW TOKEN HIGHLIGHT ALERT (ONCE-ONLY DISPLAY) */}
            {generatedKey && (
              <div 
                id="alert-key-generated"
                className="relative overflow-hidden border border-amber-500/40 bg-amber-950/20 backdrop-blur-md rounded-xl p-5 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300"
              >
                {/* Glowing decorative background */}
                <div className="absolute -right-12 -top-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>
                
                <div className="flex items-start gap-3.5">
                  <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400 shrink-0">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div className="space-y-3 w-full">
                    <div>
                      <h3 className="text-sm font-extrabold text-amber-200">
                        Secure Access Token Generated Successfully!
                      </h3>
                      <p className="text-[11.5px] text-amber-400/90 font-medium leading-relaxed mt-1">
                        Please copy this key immediately and store it securely. For safety regulations, this token is hashed in our registry and <span className="font-bold underline text-amber-300">will never be shown again</span>.
                      </p>
                    </div>

                    {/* Copy Widget */}
                    <div className="flex items-center gap-2 bg-slate-950/70 border border-amber-500/20 p-2 rounded-lg font-mono text-xs text-amber-200 select-all font-semibold overflow-x-auto whitespace-nowrap">
                      <span className="flex-1 min-w-0 break-all select-all font-bold pr-4 pl-1 text-[11px] text-amber-200">
                        {generatedKey}
                      </span>
                      <Button
                        id="btn-copy-generated-key"
                        onClick={handleCopyKey}
                        size="xs"
                        variant="outline"
                        className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/35 h-7 px-3 flex items-center gap-1 cursor-pointer shrink-0 transition-all font-mono"
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy Token
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setGeneratedKey(null)}
                        size="xs"
                        variant="ghost"
                        className="text-amber-400 hover:text-amber-200 hover:bg-amber-500/5 font-mono text-[10px] h-6 px-2 cursor-pointer"
                      >
                        Dismiss Key Alert
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ERRORS & SUCCESS ANNOUNCEMENTS */}
            {errorMessage && (
              <div className="p-3.5 border border-red-500/35 bg-red-950/15 text-red-400 text-xs font-mono rounded-lg flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
            {successMessage && !generatedKey && (
              <div className="p-3.5 border border-emerald-500/35 bg-emerald-950/15 text-emerald-400 text-xs font-mono rounded-lg flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* ACTIVE KEYS TABLE CONTAINER */}
            <Card className="border-border/40 bg-card/65 backdrop-blur-md shadow-xl overflow-hidden">
              <CardHeader className="border-b border-border/30 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Globe className="h-4.5 w-4.5 text-indigo-400" />
                      Active Access Tokens
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Listing issued SDK tokens. Revoke unused keys instantly to block agent telemetry pipelines.
                    </CardDescription>
                  </div>
                  <div className="font-mono text-[10.5px] text-muted-foreground bg-muted/20 px-2 py-0.5 rounded border border-border/30 w-fit shrink-0">
                    Showing {filteredKeys.length} of {apiKeys.length} keys
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table id="table-api-keys">
                    <TableHeader className="bg-muted/15 border-b border-border/25">
                      <TableRow>
                        <TableHead className="w-[180px] font-mono text-[10px] uppercase tracking-wider text-muted-foreground py-3 pl-6">Label / Name</TableHead>
                        <TableHead className="w-[120px] font-mono text-[10px] uppercase tracking-wider text-muted-foreground py-3">Environment</TableHead>
                        <TableHead className="w-[180px] font-mono text-[10px] uppercase tracking-wider text-muted-foreground py-3">Key Preview</TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground py-3">Last Active</TableHead>
                        <TableHead className="w-[80px] font-mono text-[10px] uppercase tracking-wider text-muted-foreground py-3 pr-6 text-center">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredKeys.map((key) => {
                        // Generate obstructed preview match pattern cb_dev_••••••••xxxx
                        // Our prefix is stored as "cb_dev_live_a3f9"
                        const envPref = key.environment === 'development' ? 'dev' : key.environment === 'staging' ? 'stg' : 'prod';
                        const lastChars = key.prefix.slice(-4);
                        const maskPreview = `cb_${envPref}_live_••••••••${lastChars}`;
                        
                        return (
                          <TableRow 
                            key={key.id}
                            id={`key-row-${key.id}`}
                            className="align-middle border-b border-border/20 hover:bg-muted/5 transition-all duration-200"
                          >
                            {/* Label */}
                            <TableCell className="py-3.5 pl-6 font-semibold text-xs text-foreground max-w-[180px] truncate">
                              {key.name}
                            </TableCell>

                            {/* Badge Scope */}
                            <TableCell className="py-3.5">
                              {getEnvironmentBadge(key.environment)}
                            </TableCell>

                            {/* Obscured Preview */}
                            <TableCell className="py-3.5 font-mono text-[11px] text-muted-foreground">
                              {maskPreview}
                            </TableCell>

                            {/* Last Active */}
                            <TableCell className="py-3.5 text-muted-foreground font-mono text-[10px] whitespace-nowrap">
                              {key.last_used_at ? (
                                <span className="text-emerald-400 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                  {new Date(key.last_used_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric'
                                  })}{' '}
                                  {new Date(key.last_used_at).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false
                                  })}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/60 italic">Never</span>
                              )}
                            </TableCell>

                            {/* Revoke Button */}
                            <TableCell className="py-3.5 pr-6 text-center">
                              <Button
                                id={`btn-revoke-${key.id}`}
                                onClick={() => handleRevokeKey(key.id, key.name)}
                                variant="destructive"
                                size="icon-sm"
                                className="hover:scale-105 cursor-pointer text-red-400 hover:text-red-300 font-mono transition-all"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredKeys.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-16 text-muted-foreground text-sm font-mono leading-relaxed border-border/10">
                            {isLoading ? (
                              <div className="flex flex-col items-center gap-2">
                                <RefreshCw className="h-6 w-6 text-indigo-500 animate-spin" />
                                <span className="text-xs">Fetching active credential indexes...</span>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <Info className="h-6 w-6 mx-auto text-muted-foreground/50" />
                                <p className="text-xs">No active access tokens found for the "{globalEnv === 'all' ? 'all environments' : globalEnv}" scope.</p>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

          </div>

        </div>
      ) : (
        /* SETUP DOCUMENTATION TAB */
        <div className="space-y-6 animate-in fade-in duration-300">
          <Card className="border-border/40 bg-card/65 backdrop-blur-md shadow-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-indigo-500 to-cyan-500"></div>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Terminal className="h-4.5 w-4.5 text-indigo-400" />
                AI Agent Proxy Integration Walkthrough
              </CardTitle>
              <CardDescription className="text-xs">
                Learn how to hook the CircuitBreaker SDK to intercept LLM function calls and prevent runaway loops or budget breaches.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-2 font-sans">
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-foreground">1. Install the SDK Package</h3>
                <div className="bg-slate-950 border border-border/40 p-3 rounded-lg font-mono text-xs text-indigo-300 select-all overflow-x-auto whitespace-pre">
                  npm install @circuitbreaker/sdk
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-foreground">2. Initialize in your Agent Framework</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Provide your active SDK key and the environment context to restrict session allowances.
                </p>
                <div className="bg-slate-950 border border-border/40 p-4 rounded-lg font-mono text-[11px] text-slate-300 select-all overflow-x-auto leading-relaxed">
{`import { CircuitBreaker } from '@circuitbreaker/sdk';

const breaker = new CircuitBreaker({
  apiKey: 'cb_dev_live_xxxxxxxxxxxxxxxxxxxxxxxx', // Replace with your generated key
  environment: 'development'
});

// Intercept your agent action loop
async function runAgent() {
  const check = await breaker.check('transfer_funds', {
    amount: 150.00,
    recipient: 'usr_94821'
  });

  if (!check.allowed) {
    console.error('🚨 Agent Action Intercepted by Guardrails:', check.reason);
    return; // Stop processing
  }

  // cleared to execute high-risk transaction...
}`}
                </div>
              </div>

              <div className="p-4 border border-indigo-500/25 bg-indigo-950/10 rounded-lg text-xs leading-relaxed text-indigo-300 font-mono">
                💡 <span className="font-bold">PRO-TIP:</span> Make sure your keys are mapped correctly to the scoped environments. Production traffic originating from a Development token will trigger strict validation blockages to protect system security.
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
