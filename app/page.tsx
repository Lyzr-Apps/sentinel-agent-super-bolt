'use client'

import { useState } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Shield,
  Zap,
  Eye,
  ChevronDown,
  Activity
} from 'lucide-react'

// TypeScript interfaces based on actual test responses
interface PlanStep {
  step_number: number
  action: string
  action_tag: string
  concerns: string[]
}

interface WorkerPlan {
  steps: PlanStep[]
  resources_needed: string[]
  external_systems: string[]
}

interface RiskScores {
  irreversibility: number
  external_impact: number
  financial: number
  safety: number
  missing_context: number
  policy_violation: number
}

interface RiskExplanations {
  irreversibility: string
  external_impact: string
  financial: string
  safety: string
  missing_context: string
  policy_violation: string
}

interface SentinelResult {
  risk_scores: RiskScores
  risk_explanations: RiskExplanations
}

type VerdictType = 'APPROVE' | 'APPROVE_WITH_NOTICE' | 'ASK_FOR_CLARIFICATION' | 'MODIFY' | 'BLOCK'

interface Verdict {
  type: VerdictType
  confidence: number
  weightedScore: number
  triggeredRules: string[]
}

// Agent IDs
const WORKER_AGENT_ID = '69858e5be5d25ce3f598caf6'
const SENTINEL_AGENT_ID = '69858e7f07ec48e3dc90a21c'

export default function Home() {
  // State management
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
  const [taskInput, setTaskInput] = useState('')
  const [workerPlan, setWorkerPlan] = useState<WorkerPlan | null>(null)
  const [sentinelResult, setSentinelResult] = useState<SentinelResult | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [loadingWorker, setLoadingWorker] = useState(false)
  const [loadingSentinel, setLoadingSentinel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showExplanations, setShowExplanations] = useState(false)

  // Decision Engine Logic
  const calculateVerdict = (scores: RiskScores): Verdict => {
    const triggeredRules: string[] = []

    // Hard overrides first
    if (scores.safety >= 3) {
      triggeredRules.push('CRITICAL: Safety score ≥ 3')
      return {
        type: 'BLOCK',
        confidence: 100,
        weightedScore: 0,
        triggeredRules
      }
    }

    if (scores.irreversibility >= 3 && scores.external_impact >= 2) {
      triggeredRules.push('CRITICAL: Irreversibility ≥ 3 AND External Impact ≥ 2')
      return {
        type: 'BLOCK',
        confidence: 100,
        weightedScore: 0,
        triggeredRules
      }
    }

    if (scores.policy_violation >= 3) {
      triggeredRules.push('CRITICAL: Policy Violation ≥ 3')
      return {
        type: 'BLOCK',
        confidence: 100,
        weightedScore: 0,
        triggeredRules
      }
    }

    // Weighted scoring
    const weightedScore =
      scores.irreversibility * 0.25 +
      scores.external_impact * 0.25 +
      scores.financial * 0.15 +
      scores.safety * 0.2 +
      scores.missing_context * 0.1 +
      scores.policy_violation * 0.05

    // Calculate confidence (inverse of weighted score normalized to percentage)
    const confidence = Math.max(0, Math.min(100, 100 - (weightedScore / 3) * 100))

    // Thresholds
    if (weightedScore < 1.0) {
      triggeredRules.push('Weighted score < 1.0')
      return { type: 'APPROVE', confidence, weightedScore, triggeredRules }
    }

    if (weightedScore < 1.5) {
      triggeredRules.push('Weighted score < 1.5')
      return { type: 'APPROVE_WITH_NOTICE', confidence, weightedScore, triggeredRules }
    }

    if (scores.missing_context >= 2) {
      triggeredRules.push('Missing Context ≥ 2')
      return { type: 'ASK_FOR_CLARIFICATION', confidence, weightedScore, triggeredRules }
    }

    if (weightedScore < 2.0) {
      triggeredRules.push('Weighted score < 2.0')
      return { type: 'MODIFY', confidence, weightedScore, triggeredRules }
    }

    triggeredRules.push('Weighted score ≥ 2.0')
    return { type: 'BLOCK', confidence, weightedScore, triggeredRules }
  }

  // Analyze Task (Worker Agent)
  const analyzeTask = async () => {
    if (!taskInput.trim()) {
      setError('Please enter a task description')
      return
    }

    setLoadingWorker(true)
    setError(null)

    try {
      const result = await callAIAgent(taskInput, WORKER_AGENT_ID)

      if (result.success && result.response.status === 'success') {
        const plan = result.response.result.plan as WorkerPlan
        setWorkerPlan(plan)
        setCurrentStep(2)
      } else {
        setError(result.response.message || 'Failed to generate plan')
      }
    } catch (err) {
      setError('Network error occurred')
    } finally {
      setLoadingWorker(false)
    }
  }

  // Evaluate Plan (Sentinel Agent)
  const evaluatePlan = async () => {
    if (!workerPlan) return

    setLoadingSentinel(true)
    setError(null)

    try {
      const planMessage = JSON.stringify({ plan: workerPlan })
      const result = await callAIAgent(planMessage, SENTINEL_AGENT_ID)

      if (result.success && result.response.status === 'success') {
        const sentinelData = result.response.result as SentinelResult
        setSentinelResult(sentinelData)

        // Calculate verdict using Decision Engine
        const calculatedVerdict = calculateVerdict(sentinelData.risk_scores)
        setVerdict(calculatedVerdict)
        setCurrentStep(3)
      } else {
        setError(result.response.message || 'Failed to evaluate plan')
      }
    } catch (err) {
      setError('Network error occurred')
    } finally {
      setLoadingSentinel(false)
    }
  }

  // Reset functionality
  const handleReset = () => {
    setCurrentStep(1)
    setTaskInput('')
    setWorkerPlan(null)
    setSentinelResult(null)
    setVerdict(null)
    setError(null)
    setShowExplanations(false)
  }

  // Verdict color mapping
  const getVerdictColor = (type: VerdictType) => {
    switch (type) {
      case 'APPROVE':
        return 'text-emerald-400'
      case 'APPROVE_WITH_NOTICE':
        return 'text-green-400'
      case 'ASK_FOR_CLARIFICATION':
        return 'text-amber-400'
      case 'MODIFY':
        return 'text-orange-400'
      case 'BLOCK':
        return 'text-red-400'
    }
  }

  const getVerdictGlow = (type: VerdictType) => {
    switch (type) {
      case 'APPROVE':
        return 'shadow-emerald-500/50'
      case 'APPROVE_WITH_NOTICE':
        return 'shadow-green-500/50'
      case 'ASK_FOR_CLARIFICATION':
        return 'shadow-amber-500/50'
      case 'MODIFY':
        return 'shadow-orange-500/50'
      case 'BLOCK':
        return 'shadow-red-500/50'
    }
  }

  const getVerdictBg = (type: VerdictType) => {
    switch (type) {
      case 'APPROVE':
        return 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10'
      case 'APPROVE_WITH_NOTICE':
        return 'bg-gradient-to-br from-green-500/20 to-green-600/10'
      case 'ASK_FOR_CLARIFICATION':
        return 'bg-gradient-to-br from-amber-500/20 to-amber-600/10'
      case 'MODIFY':
        return 'bg-gradient-to-br from-orange-500/20 to-orange-600/10'
      case 'BLOCK':
        return 'bg-gradient-to-br from-red-500/20 to-red-600/10'
    }
  }

  const getVerdictIcon = (type: VerdictType) => {
    switch (type) {
      case 'APPROVE':
        return <CheckCircle className="w-12 h-12" />
      case 'APPROVE_WITH_NOTICE':
        return <CheckCircle className="w-12 h-12" />
      case 'ASK_FOR_CLARIFICATION':
        return <AlertTriangle className="w-12 h-12" />
      case 'MODIFY':
        return <AlertCircle className="w-12 h-12" />
      case 'BLOCK':
        return <XCircle className="w-12 h-12" />
    }
  }

  const getVerdictBorder = (type: VerdictType) => {
    switch (type) {
      case 'APPROVE':
        return 'border-emerald-500/50'
      case 'APPROVE_WITH_NOTICE':
        return 'border-green-500/50'
      case 'ASK_FOR_CLARIFICATION':
        return 'border-amber-500/50'
      case 'MODIFY':
        return 'border-orange-500/50'
      case 'BLOCK':
        return 'border-red-500/50'
    }
  }

  // Action tag color mapping
  const getActionTagColor = (tag: string) => {
    switch (tag) {
      case 'READ':
        return 'bg-blue-500/10 text-blue-300 border-blue-500/30 shadow-blue-500/20'
      case 'CREATE':
        return 'bg-green-500/10 text-green-300 border-green-500/30 shadow-green-500/20'
      case 'SEND':
        return 'bg-purple-500/10 text-purple-300 border-purple-500/30 shadow-purple-500/20'
      case 'DELETE':
        return 'bg-red-500/10 text-red-300 border-red-500/30 shadow-red-500/20'
      case 'MODIFY':
        return 'bg-orange-500/10 text-orange-300 border-orange-500/30 shadow-orange-500/20'
      default:
        return 'bg-gray-500/10 text-gray-300 border-gray-500/30 shadow-gray-500/20'
    }
  }

  // Risk score color mapping
  const getRiskColor = (score: number) => {
    if (score === 0) return 'text-gray-400'
    if (score === 1) return 'text-blue-400'
    if (score === 2) return 'text-amber-400'
    return 'text-red-400'
  }

  const getRiskBg = (score: number) => {
    if (score === 0) return 'bg-gray-500/20'
    if (score === 1) return 'bg-blue-500/20'
    if (score === 2) return 'bg-amber-500/20'
    return 'bg-red-500/20'
  }

  const getRiskGradient = (score: number) => {
    if (score === 0) return 'from-gray-500/20 to-gray-600/10'
    if (score === 1) return 'from-blue-500/20 to-blue-600/10'
    if (score === 2) return 'from-amber-500/20 to-amber-600/10'
    return 'from-red-500/20 to-red-600/10'
  }

  const getRequiredAction = (type: VerdictType) => {
    switch (type) {
      case 'APPROVE':
        return 'Task may proceed as planned. No additional approval required.'
      case 'APPROVE_WITH_NOTICE':
        return 'Task may proceed with awareness of identified concerns. Monitor execution closely.'
      case 'ASK_FOR_CLARIFICATION':
        return 'Provide additional context or clarification before proceeding. Missing critical information.'
      case 'MODIFY':
        return 'Plan requires modifications to reduce risk. Review and revise the execution steps.'
      case 'BLOCK':
        return 'Task execution is BLOCKED. Risk level unacceptable. Do not proceed without senior approval.'
    }
  }

  const getDimensionIcon = (dimension: string) => {
    switch (dimension) {
      case 'irreversibility':
        return '↻'
      case 'external_impact':
        return '⚡'
      case 'financial':
        return '$'
      case 'safety':
        return '⚠'
      case 'missing_context':
        return '?'
      case 'policy_violation':
        return '⚖'
      default:
        return '•'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1a] via-[#0d1420] to-[#0a0f1a] text-white relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse delay-700"></div>
      </div>

      <div className="relative z-10 p-6 md:p-8 lg:p-12">
        {/* Header */}
        <div className="max-w-[1600px] mx-auto mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Shield className="w-10 h-10 text-blue-400" />
                <div className="absolute inset-0 bg-blue-400 blur-xl opacity-30"></div>
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  SENTINEL AGENT
                </h1>
                <p className="text-sm text-gray-500 mt-1 font-mono">AI Governance Control Tower</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-3 px-5 py-2.5 rounded-xl border backdrop-blur-sm transition-all duration-500 ${
                currentStep === 1 ? 'border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/20' :
                currentStep === 2 ? 'border-amber-500/50 bg-amber-500/10 shadow-lg shadow-amber-500/20' :
                'border-emerald-500/50 bg-emerald-500/10 shadow-lg shadow-emerald-500/20'
              }`}>
                <Activity className={`w-5 h-5 ${
                  currentStep === 1 ? 'text-blue-400 animate-pulse' :
                  currentStep === 2 ? 'text-amber-400 animate-pulse' :
                  'text-emerald-400 animate-pulse'
                }`} />
                <span className="text-sm font-mono font-semibold">
                  {currentStep === 1 ? 'AWAITING INPUT' :
                   currentStep === 2 ? 'ANALYZING PLAN' :
                   'EVALUATION COMPLETE'}
                </span>
              </div>

              <Button
                onClick={handleReset}
                variant="outline"
                className="border-gray-600/50 hover:border-gray-400 bg-gray-800/30 hover:bg-gray-700/50 backdrop-blur-sm transition-all duration-300"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="max-w-[1600px] mx-auto mb-6">
            <div className="bg-gradient-to-r from-red-500/10 to-red-600/5 border border-red-500/50 rounded-xl p-4 flex items-center gap-3 shadow-lg shadow-red-500/20 backdrop-blur-sm">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span className="text-red-300">{error}</span>
            </div>
          </div>
        )}

        {/* Three-Panel Layout */}
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
          {/* Panel 1 - Task Input */}
          <Card className={`bg-gray-900/40 border backdrop-blur-xl transition-all duration-700 ${
            currentStep === 1
              ? 'border-blue-500/50 shadow-2xl shadow-blue-500/20 scale-[1.02]'
              : 'border-gray-700/50 opacity-75 hover:opacity-90'
          }`}>
            <CardHeader className="border-b border-gray-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-blue-400" />
                  <CardTitle className="text-lg font-semibold">Task Input</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${currentStep >= 1 ? 'bg-blue-400' : 'bg-gray-600'} ${currentStep === 1 ? 'animate-pulse' : ''}`}></div>
                  <span className="text-5xl font-mono font-bold text-gray-700">01</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="relative">
                <textarea
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  placeholder="Describe the task you want the AI to execute..."
                  className="w-full min-h-[240px] p-4 bg-gray-800/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-300 backdrop-blur-sm"
                  disabled={loadingWorker || currentStep > 1}
                />
                <div className="absolute bottom-3 right-3 text-xs text-gray-500 font-mono bg-gray-900/50 px-2 py-1 rounded-lg backdrop-blur-sm">
                  {taskInput.length} chars
                </div>
              </div>

              <Button
                onClick={analyzeTask}
                disabled={loadingWorker || !taskInput.trim() || currentStep > 1}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/30 transition-all duration-300 h-12 text-base font-semibold"
              >
                {loadingWorker ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Analyzing Task...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 mr-2" />
                    Analyze Task
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Panel 2 - Worker Plan */}
          <Card className={`bg-gray-900/40 border backdrop-blur-xl transition-all duration-700 ${
            currentStep === 2
              ? 'border-amber-500/50 shadow-2xl shadow-amber-500/20 scale-[1.02]' :
            currentStep < 2
              ? 'border-gray-700/30 opacity-40'
              : 'border-gray-700/50 opacity-75 hover:opacity-90'
          }`}>
            <CardHeader className="border-b border-gray-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Eye className="w-5 h-5 text-amber-400" />
                  <CardTitle className="text-lg font-semibold">Worker Plan</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${currentStep >= 2 ? 'bg-amber-400' : 'bg-gray-600'} ${currentStep === 2 ? 'animate-pulse' : ''}`}></div>
                  <span className="text-5xl font-mono font-bold text-gray-700">02</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {loadingWorker && (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-400 mb-4" />
                  <p className="text-sm text-gray-500 font-mono">Generating execution plan...</p>
                </div>
              )}

              {workerPlan && !loadingWorker && (
                <div className="space-y-4 max-h-[520px] overflow-y-auto custom-scrollbar">
                  {/* Steps */}
                  <div className="space-y-3">
                    {workerPlan.steps.map((step, idx) => (
                      <div
                        key={step.step_number}
                        className="bg-gradient-to-br from-gray-800/60 to-gray-800/30 border border-gray-700/50 rounded-xl p-4 hover:border-gray-600/50 transition-all duration-300 backdrop-blur-sm"
                        style={{ animationDelay: `${idx * 100}ms` }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/30 to-blue-600/20 border border-blue-500/30 flex items-center justify-center text-sm font-bold font-mono text-blue-300 shadow-lg shadow-blue-500/20">
                            {step.step_number}
                          </div>
                          <div className="flex-1 space-y-2.5">
                            <div className="flex items-start gap-2">
                              <span className={`px-3 py-1.5 rounded-lg text-xs border font-mono font-semibold shadow-lg ${getActionTagColor(step.action_tag)}`}>
                                {step.action_tag}
                              </span>
                            </div>
                            <p className="text-sm text-gray-300 leading-relaxed">{step.action}</p>
                            {step.concerns.length > 0 && (
                              <div className="mt-3 space-y-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                                {step.concerns.map((concern, idx) => (
                                  <div key={idx} className="flex items-start gap-2 text-xs text-amber-400">
                                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                    <span>{concern}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Resources & Systems */}
                  <div className="grid grid-cols-1 gap-3">
                    {workerPlan.resources_needed.length > 0 && (
                      <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                          Resources Required
                        </h4>
                        <ul className="space-y-2">
                          {workerPlan.resources_needed.map((resource, idx) => (
                            <li key={idx} className="text-xs text-gray-400 flex items-start gap-2 leading-relaxed">
                              <span className="text-blue-400 mt-1">▸</span>
                              <span>{resource}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {workerPlan.external_systems.length > 0 && (
                      <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-purple-400 mb-3 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                          External Systems
                        </h4>
                        <ul className="space-y-2">
                          {workerPlan.external_systems.map((system, idx) => (
                            <li key={idx} className="text-xs text-gray-400 flex items-start gap-2 leading-relaxed">
                              <span className="text-purple-400 mt-1">▸</span>
                              <span>{system}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Evaluate Button */}
                  <Button
                    onClick={evaluatePlan}
                    disabled={loadingSentinel || currentStep > 2}
                    className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 shadow-lg shadow-amber-500/30 transition-all duration-300 h-12 text-base font-semibold"
                  >
                    {loadingSentinel ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Evaluating Plan...
                      </>
                    ) : (
                      <>
                        <Shield className="w-5 h-5 mr-2" />
                        Evaluate Plan
                      </>
                    )}
                  </Button>
                </div>
              )}

              {!workerPlan && !loadingWorker && currentStep >= 2 && (
                <div className="text-center py-20 text-gray-500">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm font-mono">No plan generated</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Panel 3 - Sentinel Verdict */}
          <Card className={`bg-gray-900/40 border backdrop-blur-xl transition-all duration-700 ${
            currentStep === 3 && verdict
              ? `${getVerdictBorder(verdict.type)} shadow-2xl ${getVerdictGlow(verdict.type)} scale-[1.02]`
              : currentStep < 3
                ? 'border-gray-700/30 opacity-40'
                : 'border-gray-700/50 opacity-75'
          }`}>
            <CardHeader className="border-b border-gray-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  <CardTitle className="text-lg font-semibold">Sentinel Verdict</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${currentStep >= 3 ? 'bg-emerald-400' : 'bg-gray-600'} ${currentStep === 3 ? 'animate-pulse' : ''}`}></div>
                  <span className="text-5xl font-mono font-bold text-gray-700">03</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {loadingSentinel && (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="w-12 h-12 animate-spin text-amber-400 mb-4" />
                  <p className="text-sm text-gray-500 font-mono">Evaluating risks...</p>
                </div>
              )}

              {verdict && sentinelResult && !loadingSentinel && (
                <div className="space-y-5 max-h-[520px] overflow-y-auto custom-scrollbar">
                  {/* Verdict Badge */}
                  <div className={`${getVerdictBg(verdict.type)} border-2 ${getVerdictBorder(verdict.type)} rounded-2xl p-6 text-center space-y-4 animate-in fade-in duration-1000 shadow-2xl ${getVerdictGlow(verdict.type)}`}>
                    <div className={`flex items-center justify-center ${getVerdictColor(verdict.type)} animate-in zoom-in duration-700`}>
                      {getVerdictIcon(verdict.type)}
                    </div>
                    <h3 className={`text-3xl font-bold ${getVerdictColor(verdict.type)} tracking-wide`}>
                      {verdict.type.replace(/_/g, ' ')}
                    </h3>
                    <div className="flex items-center justify-center gap-4 text-sm font-mono">
                      <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-1.5 rounded-lg backdrop-blur-sm">
                        <span className="text-gray-500">Confidence:</span>
                        <span className={getVerdictColor(verdict.type)}>{verdict.confidence.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-1.5 rounded-lg backdrop-blur-sm">
                        <span className="text-gray-500">Score:</span>
                        <span className={getVerdictColor(verdict.type)}>{verdict.weightedScore.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Risk Matrix */}
                  <div className="bg-gradient-to-br from-gray-800/60 to-gray-800/30 border border-gray-700/50 rounded-xl p-5 backdrop-blur-sm">
                    <h4 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Risk Matrix
                    </h4>
                    <div className="space-y-3">
                      {Object.entries(sentinelResult.risk_scores).map(([dimension, score]) => (
                        <div key={dimension} className="group">
                          <div className="flex items-center gap-3">
                            <span className="text-lg opacity-50 w-6 text-center">{getDimensionIcon(dimension)}</span>
                            <span className="text-xs text-gray-400 w-32 font-mono capitalize">
                              {dimension.replace(/_/g, ' ')}
                            </span>
                            <div className="flex items-center gap-3 flex-1">
                              <div className={`px-4 py-1.5 rounded-lg font-mono text-sm font-bold min-w-[3rem] text-center bg-gradient-to-br ${getRiskGradient(score)} border ${
                                score === 0 ? 'border-gray-500/30' :
                                score === 1 ? 'border-blue-500/30' :
                                score === 2 ? 'border-amber-500/30' :
                                'border-red-500/30'
                              } ${getRiskColor(score)} shadow-lg`}>
                                {score}
                              </div>
                              <div className="flex gap-1.5 flex-1">
                                {[0, 1, 2, 3].map((level) => (
                                  <div
                                    key={level}
                                    className={`h-2 flex-1 rounded-full transition-all duration-500 ${
                                      level <= score
                                        ? `${getRiskBg(score)} shadow-lg ${
                                            score === 3 ? 'shadow-red-500/50' :
                                            score === 2 ? 'shadow-amber-500/50' :
                                            score === 1 ? 'shadow-blue-500/50' :
                                            'shadow-gray-500/50'
                                          }`
                                        : 'bg-gray-700/30'
                                    }`}
                                    style={{ transitionDelay: `${level * 100}ms` }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Triggered Rules */}
                  <div className="bg-gradient-to-br from-gray-800/60 to-gray-800/30 border border-gray-700/50 rounded-xl p-5 backdrop-blur-sm">
                    <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Triggered Rules
                    </h4>
                    <ul className="space-y-2">
                      {verdict.triggeredRules.map((rule, idx) => (
                        <li key={idx} className="text-xs text-gray-400 flex items-start gap-2 leading-relaxed">
                          <span className={`${getVerdictColor(verdict.type)} mt-0.5`}>▸</span>
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Risk Explanations */}
                  <div className="bg-gradient-to-br from-gray-800/60 to-gray-800/30 border border-gray-700/50 rounded-xl overflow-hidden backdrop-blur-sm">
                    <button
                      onClick={() => setShowExplanations(!showExplanations)}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-700/30 transition-colors duration-200"
                    >
                      <h4 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        Risk Explanations
                      </h4>
                      <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${showExplanations ? 'rotate-180' : ''}`} />
                    </button>
                    {showExplanations && (
                      <div className="px-5 pb-4 space-y-3 border-t border-gray-700/50 pt-4">
                        {Object.entries(sentinelResult.risk_explanations).map(([dimension, explanation]) => (
                          <div key={dimension} className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-gray-500 capitalize flex items-center gap-2">
                                <span className="text-base opacity-50">{getDimensionIcon(dimension)}</span>
                                {dimension.replace(/_/g, ' ')}
                              </span>
                              <div className={`px-2 py-0.5 rounded text-xs font-bold ${getRiskBg(sentinelResult.risk_scores[dimension as keyof RiskScores])} ${getRiskColor(sentinelResult.risk_scores[dimension as keyof RiskScores])}`}>
                                {sentinelResult.risk_scores[dimension as keyof RiskScores]}
                              </div>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed pl-7">{explanation}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Required Action */}
                  <div className={`${getVerdictBg(verdict.type)} border-2 ${getVerdictBorder(verdict.type)} rounded-xl p-5 shadow-lg ${getVerdictGlow(verdict.type)}`}>
                    <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Required Action
                    </h4>
                    <p className="text-sm text-gray-300 leading-relaxed">{getRequiredAction(verdict.type)}</p>
                  </div>
                </div>
              )}

              {!verdict && !loadingSentinel && currentStep >= 3 && (
                <div className="text-center py-20 text-gray-500">
                  <XCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm font-mono">No verdict available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Custom scrollbar styles */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(17, 24, 39, 0.3);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(75, 85, 99, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(107, 114, 128, 0.7);
        }
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes zoom-in {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-in {
          animation-fill-mode: both;
        }
        .fade-in {
          animation-name: fade-in;
        }
        .zoom-in {
          animation-name: zoom-in;
        }
        .duration-700 {
          animation-duration: 700ms;
        }
        .duration-1000 {
          animation-duration: 1000ms;
        }
      `}</style>
    </div>
  )
}
