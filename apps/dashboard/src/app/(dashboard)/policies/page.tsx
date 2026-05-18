'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Trash2, 
  Plus, 
  Shield, 
  Terminal, 
  Layers, 
  Lock, 
  UserCheck, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  FileCode,
  FileText
} from 'lucide-react';

interface Policy {
  id: string;
  name: string;
  type: 'pre-flight' | 'post-flight';
  action: 'block' | 'allow' | 'human-in-the-loop';
  config: Record<string, any>;
  created_at: string;
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState<'pre-flight' | 'post-flight'>('pre-flight');
  const [action, setAction] = useState<'block' | 'human-in-the-loop'>('block');
  const [jsonConfig, setJsonConfig] = useState('{\n  "keywords": ["password", "ssn"]\n}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Template toggle
  const [activeTemplate, setActiveTemplate] = useState<'keywords' | 'parameters'>('keywords');

  useEffect(() => {
    fetchPolicies();

    // Subscribe to policy updates
    const channel = supabase
      .channel('policies_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'policies' },
        () => {
          fetchPolicies();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Live JSON validation
  useEffect(() => {
    try {
      if (!jsonConfig.trim()) {
        setJsonError('Config JSON cannot be empty');
        return;
      }
      JSON.parse(jsonConfig);
      setJsonError(null);
    } catch (e: any) {
      setJsonError(e.message);
    }
  }, [jsonConfig]);

  async function fetchPolicies() {
    const { data } = await supabase
      .from('policies')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) {
      setPolicies(data as Policy[]);
    }
  }

  const applyTemplate = (templateType: 'keywords' | 'parameters') => {
    setActiveTemplate(templateType);
    if (templateType === 'keywords') {
      setJsonConfig(JSON.stringify({
        keywords: ["credit card", "private key", "ssn"]
      }, null, 2));
    } else {
      setJsonConfig(JSON.stringify({
        toolName: "transfer_funds",
        field: "amount",
        operator: ">",
        value: 1000
      }, null, 2));
    }
  };

  async function handleCreatePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (jsonError || !name.trim()) return;

    setLoading(true);
    try {
      const parsedConfig = JSON.parse(jsonConfig);
      
      const { error } = await supabase
        .from('policies')
        .insert([{
          name,
          type,
          action,
          config: parsedConfig
        }]);

      if (error) throw error;

      // Reset form
      setName('');
      applyTemplate(activeTemplate);
    } catch (err: any) {
      alert(`Error creating policy: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePolicy(id: string) {
    if (!confirm('Are you sure you want to delete this policy?')) return;
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('policies')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err: any) {
      alert(`Error deleting policy: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
            Policy Threat Matrix
          </h1>
          <p className="text-muted-foreground text-lg mt-1">
            Build, test, and instantly synchronize active guardrails across your B2B integrations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchPolicies} className="h-9 gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Policy Creator Form (Left Column) */}
        <div className="lg:col-span-5">
          <Card className="border-border/50 bg-card/65 backdrop-blur-md shadow-xl sticky top-6">
            <CardHeader className="border-b border-border/30 bg-muted/20">
              <CardTitle className="flex items-center gap-2.5 text-xl font-bold">
                <Shield className="h-5 w-5 text-indigo-500" />
                Create Guardrail Rule
              </CardTitle>
              <CardDescription>
                Define pre-flight check parameters or post-flight response keyword analysis.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleCreatePolicy} className="space-y-6">
                
                {/* Rule Name */}
                <div className="space-y-2">
                  <label htmlFor="ruleName" className="text-sm font-semibold tracking-wide text-foreground/80">
                    Rule Name
                  </label>
                  <input
                    id="ruleName"
                    type="text"
                    required
                    placeholder="e.g. Excessive Fund Transfer Guard"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-lg border border-input bg-background/50 text-sm ring-offset-background transition-all placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                  />
                </div>

                {/* Type & Action Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="ruleType" className="text-sm font-semibold tracking-wide text-foreground/80">
                      Evaluation Type
                    </label>
                    <select
                      id="ruleType"
                      value={type}
                      onChange={(e) => setType(e.target.value as any)}
                      className="w-full h-11 px-3 rounded-lg border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="pre-flight">Pre-Flight</option>
                      <option value="post-flight">Post-Flight</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="ruleAction" className="text-sm font-semibold tracking-wide text-foreground/80">
                      Enforcement Action
                    </label>
                    <select
                      id="ruleAction"
                      value={action}
                      onChange={(e) => setAction(e.target.value as any)}
                      className="w-full h-11 px-3 rounded-lg border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="block">Block Instantly</option>
                      <option value="human-in-the-loop">Human-In-The-Loop</option>
                    </select>
                  </div>
                </div>

                {/* Template Preset Helper */}
                <div className="space-y-2.5">
                  <span className="text-sm font-semibold tracking-wide text-foreground/80 block">
                    Rule Template Helper
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => applyTemplate('keywords')}
                      className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all border ${
                        activeTemplate === 'keywords'
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-300'
                          : 'bg-background/40 hover:bg-muted border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Text Keyword Check
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTemplate('parameters')}
                      className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all border ${
                        activeTemplate === 'parameters'
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-300'
                          : 'bg-background/40 hover:bg-muted border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <FileCode className="h-3.5 w-3.5" />
                      JSON Parameter Check
                    </button>
                  </div>
                </div>

                {/* Dynamic JSON Config with Live Feedback */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label htmlFor="jsonConfig" className="text-sm font-semibold tracking-wide text-foreground/80">
                      Dynamic JSON Config
                    </label>
                    {jsonError ? (
                      <span className="text-[11px] text-red-500 font-medium flex items-center gap-1 animate-pulse">
                        <AlertCircle className="h-3 w-3" /> Invalid JSON
                      </span>
                    ) : (
                      <span className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Valid Config
                      </span>
                    )}
                  </div>
                  <textarea
                    id="jsonConfig"
                    rows={6}
                    value={jsonConfig}
                    onChange={(e) => setJsonConfig(e.target.value)}
                    className={`w-full p-4 rounded-lg font-mono text-xs bg-muted/30 border transition-all focus:outline-none ${
                      jsonError 
                        ? 'border-red-500/50 focus:ring-2 focus:ring-red-500/20' 
                        : 'border-input focus:ring-2 focus:ring-ring'
                    }`}
                  />
                  {jsonError && (
                    <p className="text-[11px] text-red-500/90 font-mono mt-1 pl-1 bg-red-500/5 p-2 rounded-md border border-red-500/10">
                      {jsonError}
                    </p>
                  )}
                </div>

                {/* Submit Action */}
                <Button
                  type="submit"
                  disabled={loading || !!jsonError || !name.trim()}
                  className="w-full h-11 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold shadow-lg transition-all rounded-lg gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {loading ? 'Synchronizing Rule...' : 'Deploy Active Rule'}
                </Button>

              </form>
            </CardContent>
          </Card>
        </div>

        {/* Active Policies List (Right Column) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-500" />
              Active Policies Matrix ({policies.length})
            </h3>
          </div>

          <div className="space-y-4">
            {policies.map((policy) => {
              const isKeywords = policy.config?.keywords !== undefined;
              const isParameters = policy.config?.toolName !== undefined;

              return (
                <Card 
                  key={policy.id} 
                  className="border-border/40 hover:border-border/80 bg-card/40 hover:bg-card/75 transition-all shadow-sm hover:shadow-md relative overflow-hidden group"
                >
                  {/* Subtle top decoration indicating type */}
                  <div className={`absolute top-0 left-0 right-0 h-[2px] ${
                    policy.type === 'pre-flight' 
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500' 
                      : 'bg-gradient-to-r from-violet-500 to-purple-500'
                  }`} />

                  <CardContent className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4 pt-6">
                    <div className="space-y-3 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-lg text-foreground tracking-tight truncate">
                          {policy.name}
                        </h4>
                        <Badge variant="outline" className="capitalize text-xs py-0 h-5 border-indigo-200 text-indigo-700 bg-indigo-50/50 dark:border-indigo-900/60 dark:text-indigo-400 dark:bg-indigo-950/20">
                          {policy.type}
                        </Badge>
                        <Badge 
                          variant={policy.action === 'block' ? 'destructive' : 'secondary'} 
                          className="capitalize text-xs py-0 h-5"
                        >
                          {policy.action === 'block' ? (
                            <Lock className="mr-1 h-2.5 w-2.5 inline" />
                          ) : (
                            <UserCheck className="mr-1 h-2.5 w-2.5 inline" />
                          )}
                          {policy.action}
                        </Badge>
                      </div>

                      {/* Config Renderers */}
                      {isKeywords && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                            Trigger Keywords:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {policy.config.keywords.map((kw: string, i: number) => (
                              <Badge key={i} variant="outline" className="bg-background/60 font-mono text-[10px]">
                                {kw}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {isParameters && (
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                            Parameter Evaluator:
                          </span>
                          <div className="bg-muted/30 dark:bg-muted/20 border border-border/30 rounded-md p-2.5 font-mono text-xs space-y-1">
                            <div>
                              <span className="text-muted-foreground">Tool Target:</span>{' '}
                              <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                                {policy.config.toolName}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Rule Path:</span>{' '}
                              <span className="text-foreground font-medium">
                                {policy.config.field} {policy.config.operator || policy.config.condition?.split(' ')[0] || '=='} {policy.config.value || policy.config.condition?.split(' ')[1]}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Fallback JSON Configuration Inspector */}
                      {!isKeywords && !isParameters && (
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block flex items-center gap-1">
                            <Terminal className="h-3 w-3" /> Raw JSON Rule Configuration:
                          </span>
                          <pre className="p-3 bg-muted/40 dark:bg-muted/25 rounded-md text-[10px] font-mono overflow-x-auto text-foreground/80 max-h-32 border border-border/20">
                            {JSON.stringify(policy.config, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>

                    {/* Delete Action Trigger */}
                    <div className="flex md:self-start self-end justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={deletingId === policy.id}
                        onClick={() => handleDeletePolicy(policy.id)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50/50 dark:hover:bg-red-950/20 h-9 w-9 p-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {policies.length === 0 && (
              <div className="text-center py-16 border-2 border-dashed border-border/60 rounded-xl bg-card/20 text-muted-foreground">
                <Shield className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <h4 className="font-semibold text-foreground/95">No Active Guardrails</h4>
                <p className="text-sm mt-1 max-w-sm mx-auto">
                  Deploy a new rule using the form on the left to start screening B2B transaction streams.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
