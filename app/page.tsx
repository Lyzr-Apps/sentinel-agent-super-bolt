'use client'

import { useState } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Loader2, AlertCircle, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'

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
  }

  // Verdict color mapping
  const getVerdictColor = (type: VerdictType) => {
    switch (type) {
      case 'APPROVE':
        return 'text-emerald-500 border-emerald-500'
      case 'APPROVE_WITH_NOTICE':
        return 'text-green-400 border-green-400'
      case 'ASK_FOR_CLARIFICATION':
        return 'text-amber-400 border-amber-400'
      case 'MODIFY':
        return 'text-orange-500 border-orange-500'
      case 'BLOCK':
        return 'text-red-500 border-red-500'
    }
  }

  const getVerdictBg = (type: VerdictType) => {
    switch (type) {
      case 'APPROVE':
        return 'bg-emerald-500/10'
      case 'APPROVE_WITH_NOTICE':
        return 'bg-green-400/10'
      case 'ASK_FOR_CLARIFICATION':
        return 'bg-amber-400/10'
      case 'MODIFY':
        return 'bg-orange-500/10'
      case 'BLOCK':
        return 'bg-red-500/10'
    }
  }

  const getVerdictIcon = (type: VerdictType) => {
    switch (type) {
      case 'APPROVE':
        return <CheckCircle className="w-8 h-8" />
      case 'APPROVE_WITH_NOTICE':
        return <CheckCircle className="w-8 h-8" />
      case 'ASK_FOR_CLARIFICATION':
        return <AlertTriangle className="w-8 h-8" />
      case 'MODIFY':
        return <AlertCircle className="w-8 h-8" />
      case 'BLOCK':
        return <XCircle className="w-8 h-8" />
    }
  }

  // Action tag color mapping
  const getActionTagColor = (tag: string) => {
    switch (tag) {
      case 'READ':
        return 'bg-blue-500/20 text-blue-300 border-blue-500'
      case 'CREATE':
        return 'bg-green-500/20 text-green-300 border-green-500'
      case 'SEND':
        return 'bg-purple-500/20 text-purple-300 border-purple-500'
      case 'DELETE':
        return 'bg-red-500/20 text-red-300 border-red-500'
      case 'MODIFY':
        return 'bg-orange-500/20 text-orange-300 border-orange-500'
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500'
    }
  }

  // Risk score color mapping
  const getRiskColor = (score: number) => {
    if (score === 0) return 'text-gray-400'
    if (score === 1) return 'text-blue-400'
    if (score === 2) return 'text-amber-400'
    return 'text-red-500'
  }

  const getRiskBg = (score: number) => {
    if (score === 0) return 'bg-gray-500/20'
    if (score === 1) return 'bg-blue-500/20'
    if (score === 2) return 'bg-amber-500/20'
    return 'bg-red-500/20'
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

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">SENTINEL AGENT</h1>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
              currentStep === 1 ? 'border-blue-500 bg-blue-500/10' :
              currentStep === 2 ? 'border-amber-500 bg-amber-500/10' :
              'border-emerald-500 bg-emerald-500/10'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                currentStep === 1 ? 'bg-blue-500 animate-pulse' :
                currentStep === 2 ? 'bg-amber-500 animate-pulse' :
                'bg-emerald-500 animate-pulse'
              }`} />
              <span className="text-sm font-mono">
                {currentStep === 1 ? 'AWAITING INPUT' :
                 currentStep === 2 ? 'ANALYZING PLAN' :
                 'EVALUATION COMPLETE'}
              </span>
            </div>
          </div>
          <Button
            onClick={handleReset}
            variant="outline"
            className="border-gray-600 hover:border-gray-400"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto mb-6">
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-300">{error}</span>
          </div>
        </div>
      )}

      {/* Three-Panel Layout */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel 1 - Task Input */}
        <Card className={`bg-gray-900/50 border-gray-700 transition-all duration-500 ${
          currentStep === 1 ? 'ring-2 ring-blue-500 shadow-lg shadow-blue-500/20' : 'opacity-75'
        }`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Task Input</CardTitle>
              <span className="text-4xl font-mono text-gray-600">01</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Describe the task you want the AI to execute..."
              className="w-full min-h-[200px] p-3 bg-gray-800/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loadingWorker || currentStep > 1}
            />
            <div className="text-sm text-gray-500 text-right">
              {taskInput.length} characters
            </div>
            <Button
              onClick={analyzeTask}
              disabled={loadingWorker || !taskInput.trim() || currentStep > 1}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {loadingWorker ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                'Analyze Task'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Panel 2 - Worker Plan */}
        <Card className={`bg-gray-900/50 border-gray-700 transition-all duration-500 ${
          currentStep === 2 ? 'ring-2 ring-amber-500 shadow-lg shadow-amber-500/20' :
          currentStep < 2 ? 'opacity-40' : 'opacity-75'
        }`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Worker Plan</CardTitle>
              <span className="text-4xl font-mono text-gray-600">02</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingWorker && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            )}

            {workerPlan && !loadingWorker && (
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {/* Steps */}
                <div className="space-y-3">
                  {workerPlan.steps.map((step) => (
                    <div key={step.step_number} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-mono">
                          {step.step_number}
                        </span>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start gap-2">
                            <span className={`px-2 py-1 rounded text-xs border font-mono ${getActionTagColor(step.action_tag)}`}>
                              {step.action_tag}
                            </span>
                          </div>
                          <p className="text-sm text-gray-300">{step.action}</p>
                          {step.concerns.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {step.concerns.map((concern, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-xs text-amber-400">
                                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
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

                {/* Resources */}
                {workerPlan.resources_needed.length > 0 && (
                  <div className="border-t border-gray-700 pt-3">
                    <h4 className="text-sm font-semibold text-gray-400 mb-2">Resources Needed</h4>
                    <ul className="space-y-1">
                      {workerPlan.resources_needed.map((resource, idx) => (
                        <li key={idx} className="text-xs text-gray-500 flex items-start gap-2">
                          <span className="text-blue-400">•</span>
                          <span>{resource}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* External Systems */}
                {workerPlan.external_systems.length > 0 && (
                  <div className="border-t border-gray-700 pt-3">
                    <h4 className="text-sm font-semibold text-gray-400 mb-2">External Systems</h4>
                    <ul className="space-y-1">
                      {workerPlan.external_systems.map((system, idx) => (
                        <li key={idx} className="text-xs text-gray-500 flex items-start gap-2">
                          <span className="text-purple-400">•</span>
                          <span>{system}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Evaluate Button */}
                <Button
                  onClick={evaluatePlan}
                  disabled={loadingSentinel || currentStep > 2}
                  className="w-full bg-amber-600 hover:bg-amber-700"
                >
                  {loadingSentinel ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Evaluating...
                    </>
                  ) : (
                    'Evaluate Plan'
                  )}
                </Button>
              </div>
            )}

            {!workerPlan && !loadingWorker && currentStep >= 2 && (
              <div className="text-center py-12 text-gray-500">
                No plan generated
              </div>
            )}
          </CardContent>
        </Card>

        {/* Panel 3 - Sentinel Verdict */}
        <Card className={`bg-gray-900/50 border-gray-700 transition-all duration-500 ${
          currentStep === 3 ? `ring-2 shadow-lg ${verdict ? getVerdictColor(verdict.type).replace('text-', 'ring-').replace('border-', 'shadow-') + '/20' : ''}` :
          'opacity-40'
        }`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Sentinel Verdict</CardTitle>
              <span className="text-4xl font-mono text-gray-600">03</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingSentinel && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              </div>
            )}

            {verdict && sentinelResult && !loadingSentinel && (
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {/* Verdict Badge */}
                <div className={`${getVerdictBg(verdict.type)} border ${getVerdictColor(verdict.type)} rounded-lg p-4 text-center space-y-2 animate-in fade-in duration-700`}>
                  <div className={`flex items-center justify-center ${getVerdictColor(verdict.type)}`}>
                    {getVerdictIcon(verdict.type)}
                  </div>
                  <h3 className={`text-2xl font-bold ${getVerdictColor(verdict.type)}`}>
                    {verdict.type.replace(/_/g, ' ')}
                  </h3>
                  <p className="text-sm text-gray-400 font-mono">
                    Confidence: {verdict.confidence.toFixed(1)}% | Score: {verdict.weightedScore.toFixed(2)}
                  </p>
                </div>

                {/* Risk Matrix */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-gray-400 mb-3">Risk Matrix</h4>
                  <div className="space-y-2">
                    {Object.entries(sentinelResult.risk_scores).map(([dimension, score]) => (
                      <div key={dimension} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-32 font-mono">
                          {dimension.replace(/_/g, ' ')}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`${getRiskBg(score)} ${getRiskColor(score)} px-3 py-1 rounded font-mono text-sm font-bold`}>
                            {score}
                          </span>
                          <div className="flex gap-1">
                            {[0, 1, 2, 3].map((level) => (
                              <div
                                key={level}
                                className={`w-2 h-4 rounded ${
                                  level <= score ? getRiskBg(score) : 'bg-gray-700/50'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Triggered Rules */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-gray-400 mb-2">Triggered Rules</h4>
                  <ul className="space-y-1">
                    {verdict.triggeredRules.map((rule, idx) => (
                      <li key={idx} className="text-xs text-gray-400 flex items-start gap-2">
                        <span className="text-amber-400">•</span>
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Risk Explanations */}
                <details className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                  <summary className="text-sm font-semibold text-gray-400 cursor-pointer">
                    Risk Explanations
                  </summary>
                  <div className="mt-3 space-y-2">
                    {Object.entries(sentinelResult.risk_explanations).map(([dimension, explanation]) => (
                      <div key={dimension} className="text-xs">
                        <span className="text-gray-500 font-mono">{dimension.replace(/_/g, ' ')}:</span>
                        <p className="text-gray-400 mt-1">{explanation}</p>
                      </div>
                    ))}
                  </div>
                </details>

                {/* Required Action */}
                <div className={`${getVerdictBg(verdict.type)} border ${getVerdictColor(verdict.type)} rounded-lg p-3`}>
                  <h4 className="text-sm font-semibold text-gray-400 mb-2">Required Action</h4>
                  <p className="text-sm text-gray-300">{getRequiredAction(verdict.type)}</p>
                </div>
              </div>
            )}

            {!verdict && !loadingSentinel && currentStep >= 3 && (
              <div className="text-center py-12 text-gray-500">
                No verdict available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
