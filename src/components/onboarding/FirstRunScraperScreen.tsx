import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  RefreshCw,
  Play,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  XCircle,
  Database,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Copy,
  Globe,
  Check,
  HelpCircle,
  Terminal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import appIcon from '@/assets/app-icon.png'
import { scraperService, ScraperAccessStatus, ScraperManagerStatus, ScraperLog } from '@/services/scraperService'
import { nativeLibraryService } from '@/services/nativeLibrary'
import { useI18n } from '@/i18n'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ScraperCategory } from '@/types/scraper'
import { CategorySelector } from '@/components/scraper/CategorySelector'
import { TemporaryConnectionNotice } from '@/components/scraper/TemporaryConnectionNotice'
import { ScraperProgress } from '@/components/scraper/ScraperProgress'
import { openExternal } from '@/platform/shell'

const RUTRACKER_TARGET_FORUM_URL = 'https://rutracker.org/forum/viewforum.php?f=548'

export type OnboardingStep = 'WELCOME' | 'CATEGORIES' | 'COMPANION' | 'ACCESS' | 'SYNC' | 'READY'

interface FirstRunScraperScreenProps {
  onComplete: () => void
  initialStep?: OnboardingStep
}

export const FirstRunScraperScreen: React.FC<FirstRunScraperScreenProps> = ({
  onComplete,
  initialStep = 'WELCOME',
}) => {
  const { t } = useI18n()
  const statusVersion = useRef(0)
  const startInFlight = useRef(false)

  // Step state
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(initialStep)

  // Category state
  const [categories, setCategories] = useState<ScraperCategory[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set())
  const [initialCategoryIds, setInitialCategoryIds] = useState<Set<string>>(new Set())
  const [isSavingCategories, setIsSavingCategories] = useState(false)

  // Companion help modal
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false)

  // Access & scraper status
  const [access, setAccess] = useState<ScraperAccessStatus | null>(null)
  const [scraperState, setScraperState] = useState<ScraperManagerStatus>({
    state: 'idle',
    isRunning: false,
    progress: null,
    logs: [],
    startTime: null,
  })

  const [completedStats, setCompletedStats] = useState<{ items: number; categories: number }>({
    items: 0,
    categories: 0,
  })

  // Real-time live log feed
  const [recentLogs, setRecentLogs] = useState<ScraperLog[]>([])
  const [isLogExpanded, setIsLogExpanded] = useState(true)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Companion connection & access results
  const [companionStatus, setCompanionStatus] = useState<{ port: number | null; token: string | null; connected: boolean }>({
    port: null,
    token: null,
    connected: false,
  })
  const [isConnectingCompanion, setIsConnectingCompanion] = useState(false)
  const [isCheckingCompanionAccess, setIsCheckingCompanionAccess] = useState(false)
  const [companionAccessResult, setCompanionAccessResult] = useState<{
    status: string
    topicCount?: number
    error?: string
  } | null>(null)
  const [isPausing, setIsPausing] = useState(false)
  const [isResuming, setIsResuming] = useState(false)
  const [transportChoice, setTransportChoice] = useState<'BUILT_IN' | 'COMPANION'>('COMPANION')
  const [embeddedStatus, setEmbeddedStatus] = useState<'UNCHECKED' | 'CHECKING' | 'READY' | 'VERIFICATION_REQUIRED' | 'ERROR'>('UNCHECKED')

  // Database restore state (for restoring backup in initial setup)
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoredSummary, setRestoredSummary] = useState<{ items: number; categories: number } | null>(null)

  // Load all categories on mount
  const loadCategories = useCallback(async () => {
    try {
      const cats = await scraperService.getCategories()
      setCategories(cats)
      const enabledIds = new Set(cats.filter((c) => c.enabled !== false).map((c) => c.id))
      setSelectedCategoryIds(enabledIds)
      setInitialCategoryIds(new Set(enabledIds))
    } catch (_) {}
  }, [])

  useEffect(() => {
    loadCategories()

    scraperService.getState().then((status) => {
      setScraperState(status)
      setAccess(status.access || null)
      if (status.companionConnected !== undefined) {
        setCompanionStatus((prev) => ({ ...prev, connected: Boolean(status.companionConnected) }))
      }
      if (status.isRunning || ['running', 'verifying', 'starting', 'pausing', 'paused', 'resuming'].includes(status.state)) {
        setCurrentStep('SYNC')
      }
    }).catch(() => {})

    const checkCompanion = () => {
      scraperService.getCompanionStatus().then((s) => {
        setCompanionStatus(s)
      }).catch(() => {})
    }
    checkCompanion()
    const pollTimer = setInterval(checkCompanion, 2000)

    const unregState = scraperService.onStateChanged((stateData: any) => {
      statusVersion.current += 1
      if (stateData.details?.results) setAccess(stateData.details)

      setScraperState((prev: ScraperManagerStatus) => ({
        ...prev,
        state: stateData.state,
        isRunning: ['preflight', 'starting', 'verifying', 'reprobing', 'running', 'pausing', 'paused', 'resuming', 'cancelling'].includes(stateData.state),
        pendingScan: stateData.details?.pendingScan ?? prev.pendingScan,
        verificationOutcome: stateData.details?.verificationOutcome ?? prev.verificationOutcome,
      }))

      if (['running', 'verifying', 'starting', 'pausing', 'paused', 'resuming'].includes(stateData.state)) {
        setCurrentStep('SYNC')
      }

      if (stateData.state === 'completed') {
        nativeLibraryService.getReadiness().then((r) => {
          setCompletedStats({
            items: r.itemCount,
            categories: r.categoriesCount || 0,
          })
          setCurrentStep('READY')
        }).catch(() => {
          setCurrentStep('READY')
        })
      }
    })

    const unregProgress = scraperService.onProgress((prog: any) => {
      statusVersion.current += 1
      setScraperState((prev: ScraperManagerStatus) => ({
        ...prev,
        progress: prog,
      }))
    })

    const unregAccess = scraperService.onAccessChanged((result) => {
      statusVersion.current += 1
      setAccess(result)
    })

    const unregLog = scraperService.onLog((log: ScraperLog) => {
      setRecentLogs((prev) => [...prev.slice(-49), log])
    })

    const unregPage = scraperService.onPageCommitted((event) => {
      setRecentLogs((prev) => [
        ...prev.slice(-49),
        {
          level: 'info',
          message: `Saved ${event.categoryName} (Page ${event.page}${event.totalPages ? ` / ${event.totalPages}` : ''}): +${event.inserted} new games (${event.totalSaved} total)`,
          timestamp: new Date().toISOString(),
        },
      ])
    })

    return () => {
      clearInterval(pollTimer)
      unregState()
      unregProgress()
      unregAccess()
      unregLog()
      unregPage()
    }
  }, [loadCategories])

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [recentLogs])

  // Category toggle actions
  const handleToggleCategory = (id: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAllCategories = () => {
    setSelectedCategoryIds(new Set(categories.map((c) => c.id)))
  }

  const handleClearAllCategories = () => {
    setSelectedCategoryIds(new Set())
  }

  // Persist category changes and advance
  const handleSaveCategoriesAndAdvance = async () => {
    if (selectedCategoryIds.size === 0) return
    setIsSavingCategories(true)
    try {
      // Find diffs and persist
      const promises: Promise<any>[] = []
      for (const cat of categories) {
        const isSelected = selectedCategoryIds.has(cat.id)
        const wasSelected = initialCategoryIds.has(cat.id)
        if (isSelected !== wasSelected) {
          promises.push(scraperService.setCategoryEnabled(cat.id, isSelected))
        }
      }
      await Promise.all(promises)
      setInitialCategoryIds(new Set(selectedCategoryIds))
      setCurrentStep('COMPANION')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSavingCategories(false)
    }
  }

  // Companion connection
  const handleConnectCompanion = async () => {
    try {
      setIsConnectingCompanion(true)
      const res = await scraperService.connectCompanion()
      setCompanionStatus(res)
      if (res.connected) {
        toast.success(t('settings.scraper.companionConnected'))
      } else {
        toast.info(t('settings.scraper.companionConnectionCode'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsConnectingCompanion(false)
    }
  }

  const handleOpenBrowser = async () => {
    try {
      await scraperService.openCompanionRuTracker()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const handleCheckCompanionAccess = async () => {
    try {
      setIsCheckingCompanionAccess(true)
      const res = await scraperService.checkCompanionAccess()
      setCompanionAccessResult(res)
      if (res.status === 'FORUM_READY') {
        toast.success(`${t('onboarding.statusForumReadyHuman')} (${res.topicCount ?? 0} ${t('settings.scraper.companionTopicCount')})`)
      } else if (res.status === 'INTERACTION_REQUIRED' || res.status === 'CHALLENGE_REQUIRED') {
        toast.error(t('onboarding.statusVerificationHuman'))
      } else if (res.status === 'NO_RUTRACKER_TAB') {
        toast.error(t('onboarding.statusNoTabHuman'))
      } else {
        toast.error(res.error || res.status)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCheckingCompanionAccess(false)
    }
  }

  const handleProbeEmbedded = async () => {
    setEmbeddedStatus('CHECKING')
    try {
      const res = await scraperService.embeddedProbe()
      if (res?.status === 'FORUM_READY' || res?.forumDetected) {
        setEmbeddedStatus('READY')
        toast.success(`${t('onboarding.statusForumReadyHuman')} (${res.topicCount || 0} ${t('settings.scraper.companionTopicCount')})`)
      } else if (res?.status === 'CHALLENGE_REQUIRED') {
        setEmbeddedStatus('VERIFICATION_REQUIRED')
        toast.warning(t('onboarding.statusVerificationHuman'))
      } else {
        setEmbeddedStatus('ERROR')
        toast.error(`Status: ${res?.status || 'Unknown'}`)
      }
    } catch (err: any) {
      setEmbeddedStatus('ERROR')
      toast.error(err?.message || 'Access probe failed')
    }
  }

  const handleVerifyEmbedded = async () => {
    try {
      const res = await scraperService.embeddedVerify()
      if (res?.success) {
        setEmbeddedStatus('READY')
        toast.success(t('onboarding.verificationSuccess'))
      }
    } catch (err: any) {
      if (err?.code !== 'VERIFICATION_CANCELLED_BY_USER') {
        toast.error(err?.message || 'Verification failed')
      }
    }
  }

  const handleRestoreDatabase = async () => {
    try {
      setIsRestoring(true)
      const res = await window.rtLibrary?.database?.restoreBackup?.()
      if (res?.canceled) {
        return
      }
      if (res?.success) {
        await loadCategories()
        const readiness = await nativeLibraryService.getReadiness().catch(() => ({ itemCount: 0, categoriesCount: 0 }))
        const summary = {
          items: readiness.itemCount || 0,
          categories: readiness.categoriesCount || 0,
        }
        setRestoredSummary(summary)
        toast.success(t('onboarding.restoreSuccessToast', summary))
      }
    } catch (err: any) {
      toast.error(err?.message || t('onboarding.restoreErrorToast'))
    } finally {
      setIsRestoring(false)
    }
  }

  const handleAdvanceFromCompanion = async () => {
    if (transportChoice === 'BUILT_IN') {
      try {
        await scraperService.setTransportPreference('EMBEDDED_ELECTRON')
      } catch (_) {}
      if (embeddedStatus === 'READY') {
        handleStartInitialScan()
        return
      }
    } else {
      try {
        await scraperService.setTransportPreference('BROWSER_COMPANION')
      } catch (_) {}
    }
    setCurrentStep('ACCESS')
  }

  // Auto-start scan if user arrives at SYNC step while idle
  useEffect(() => {
    if (currentStep === 'SYNC' && scraperState.state === 'idle' && !startInFlight.current) {
      handleStartInitialScan()
    }
  }, [currentStep, scraperState.state])

  // Start initial scan
  const handleStartInitialScan = async () => {
    if (startInFlight.current) return
    startInFlight.current = true
    statusVersion.current += 1
    setCurrentStep('SYNC')
    setScraperState((prev) => ({
      ...prev,
      state: 'starting',
      isRunning: true,
      progress: {
        category: 'ALL',
        categoryName: t('onboarding.synchronizing'),
        currentPage: 0,
        totalPages: 0,
        totalItems: 0,
      },
    }))
    try {
      const result = await scraperService.start({ full: false, headless: true })
      if (result.success) toast.info(t('onboarding.scanStarted'))
    } catch (err) {
      statusVersion.current += 1
      scraperService.getState().then((status) => {
        setScraperState(status)
        setAccess(status.access || null)
      }).catch(() => {
        setScraperState((prev) => ({ ...prev, state: 'failed', isRunning: false }))
      })
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      startInFlight.current = false
    }
  }

  const handleCancelScan = async () => {
    try {
      await scraperService.cancel()
      toast.info(t('onboarding.scanCancelled'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    if (scraperState.state === 'paused') {
      setIsPausing(false)
    } else if (scraperState.state === 'running') {
      setIsResuming(false)
    } else if (['idle', 'completed', 'failed'].includes(scraperState.state)) {
      setIsPausing(false)
      setIsResuming(false)
    }
  }, [scraperState.state])

  const handlePauseScan = async () => {
    try {
      setIsPausing(true)
      await scraperService.pause()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      setIsPausing(false)
    }
  }

  const handleResumeScan = async () => {
    try {
      setIsResuming(true)
      await scraperService.resume()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      setIsResuming(false)
    }
  }

  const handleBrowseLibrary = async () => {
    try {
      await nativeLibraryService.dismissOnboarding()
    } catch (err) {
      console.warn('[FirstRunScraperScreen] Failed to dismiss onboarding:', err)
    }
    onComplete()
  }

  const isRunning = scraperState.isRunning
  const progress = scraperState.progress
  const percent =
    progress && (progress.totalPages ?? 0) > 0
      ? Math.round(((progress.currentPage ?? 0) / progress.totalPages!) * 100)
      : 0

  const isCompanionReady = companionStatus.connected && companionAccessResult?.status === 'FORUM_READY'

  // Human friendly access message
  const getHumanAccessStatus = () => {
    if (!companionAccessResult) {
      if (companionStatus.connected) return { text: t('onboarding.connectedToSession'), isOk: true, isWarning: false }
      return { text: t('onboarding.statusDisconnectedHuman'), isOk: false, isWarning: false }
    }
    const s = companionAccessResult.status
    if (s === 'FORUM_READY') {
      return { text: `${t('onboarding.statusForumReadyHuman')} (${companionAccessResult.topicCount ?? 0} ${t('settings.scraper.companionTopicCount')})`, isOk: true, isWarning: false }
    }
    if (s === 'INTERACTION_REQUIRED' || s === 'CHALLENGE_REQUIRED') {
      return { text: t('onboarding.statusVerificationHuman'), isOk: false, isWarning: true }
    }
    if (s === 'NO_RUTRACKER_TAB') {
      return { text: t('onboarding.statusNoTabHuman'), isOk: false, isWarning: true }
    }
    if (s === 'REQUEST_TIMEOUT') {
      return { text: t('onboarding.statusTimeoutHuman'), isOk: false, isWarning: true }
    }
    if (s === 'AUTH_REQUIRED') {
      return { text: t('onboarding.statusAuthHuman'), isOk: false, isWarning: true }
    }
    return { text: companionAccessResult.error || t('onboarding.statusErrorHuman'), isOk: false, isWarning: true }
  }

  const humanAccess = getHumanAccessStatus()

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 select-none relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div
        className={cn(
          'w-full bg-neutral-900/90 border border-neutral-800 rounded-2xl shadow-2xl backdrop-blur-md relative z-10 flex flex-col items-center text-center transition-all duration-300',
          currentStep === 'CATEGORIES'
            ? 'max-w-4xl p-6 sm:p-7 space-y-3.5'
            : 'max-w-2xl p-8 space-y-6 max-h-[92vh] overflow-y-auto custom-scrollbar'
        )}
      >
        {/* Step Indicator Header (Steps 1 to 5) */}
        {currentStep !== 'READY' && (
          <div className="w-full flex items-center justify-between border-b border-neutral-800 pb-3 mb-1" aria-label="Onboarding Progress">
            <div className="flex items-center space-x-2">
              <img src={appIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
              <span className="text-xs font-bold tracking-tight text-neutral-300">RT-Library</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
              <span className={cn('px-2 py-0.5 rounded-full', currentStep === 'WELCOME' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-neutral-800')}>1</span>
              <span className="text-neutral-600">→</span>
              <span className={cn('px-2 py-0.5 rounded-full', currentStep === 'CATEGORIES' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-neutral-800')}>2</span>
              <span className="text-neutral-600">→</span>
              <span className={cn('px-2 py-0.5 rounded-full', currentStep === 'COMPANION' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-neutral-800')}>3</span>
              <span className="text-neutral-600">→</span>
              <span className={cn('px-2 py-0.5 rounded-full', currentStep === 'ACCESS' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-neutral-800')}>4</span>
              <span className="text-neutral-600">→</span>
              <span className={cn('px-2 py-0.5 rounded-full', currentStep === 'SYNC' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-neutral-800')}>5</span>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 1: WELCOME */}
        {/* ========================================================================= */}
        {currentStep === 'WELCOME' && (
          <div className="w-full space-y-6 animate-in fade-in-50 duration-200">
            <div className="flex flex-col items-center space-y-2">
              <img src={appIcon} alt="" aria-hidden="true" className="h-16 w-16 object-contain drop-shadow-xl" />
              <h1 className="text-2xl font-bold tracking-tight text-neutral-100">
                {t('onboarding.welcomeTitle')}
              </h1>
              <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
                {t('onboarding.welcomeSubtitle')}
              </p>
            </div>

            {/* 3 Visual Journey Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
              <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-200">
                  <Database className="h-4 w-4 text-emerald-400" />
                  <span>1. {t('onboarding.welcomeStep1Title')}</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-normal">
                  {t('onboarding.welcomeStep1Desc')}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-200">
                  <Globe className="h-4 w-4 text-blue-400" />
                  <span>2. {t('onboarding.welcomeStep2Title')}</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-normal">
                  {t('onboarding.welcomeStep2Desc')}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-200">
                  <CheckCircle2 className="h-4 w-4 text-purple-400" />
                  <span>3. {t('onboarding.welcomeStep3Title')}</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-normal">
                  {t('onboarding.welcomeStep3Desc')}
                </p>
              </div>
            </div>

            {/* Action Buttons or Restored Card */}
            {restoredSummary ? (
              <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-left space-y-3 animate-in fade-in-50">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-neutral-100">
                      {t('onboarding.restoreSuccessTitle')}
                    </h3>
                    <p className="text-xs text-emerald-300 font-medium">
                      {t('onboarding.restoreSuccessSummary', { items: restoredSummary.items, categories: restoredSummary.categories })}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  {t('onboarding.restoreNextStepDesc')}
                </p>
                <div className="space-y-2 pt-1">
                  <Button
                    onClick={() => setCurrentStep('CATEGORIES')}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-11 text-xs rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <span>{t('onboarding.continueScrapingWithRestored')}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onComplete}
                    className="w-full border-neutral-700 hover:border-emerald-500/50 hover:bg-neutral-800 text-neutral-200 text-xs h-9 rounded-xl gap-2 cursor-pointer"
                  >
                    <Database className="h-3.5 w-3.5 text-emerald-400" />
                    <span>{t('onboarding.openLibraryDirectly')}</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                <Button
                  onClick={() => setCurrentStep('CATEGORIES')}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-11 text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <span>{t('onboarding.getStarted')}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-neutral-800"></div>
                  <span className="flex-shrink mx-3 text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                    {t('onboarding.orRestoreExistingBackup')}
                  </span>
                  <div className="flex-grow border-t border-neutral-800"></div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRestoreDatabase}
                  disabled={isRestoring}
                  className="w-full h-10 border-neutral-700 hover:border-emerald-500/50 hover:bg-neutral-800 text-neutral-200 text-xs gap-2 cursor-pointer"
                >
                  {isRestoring ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  ) : (
                    <Database className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span>{isRestoring ? t('onboarding.restoringDatabase') : t('onboarding.restoreBackupButton')}</span>
                </Button>

                <div className="flex items-center justify-center text-xs text-neutral-400 pt-1">
                  <button
                    type="button"
                    onClick={onComplete}
                    className="hover:text-neutral-200 transition-colors cursor-pointer"
                  >
                    {t('onboarding.continueWithoutSync')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: CHOOSE CATEGORIES */}
        {/* ========================================================================= */}
        {currentStep === 'CATEGORIES' && (
          <div className="w-full space-y-3.5 animate-in fade-in-50 duration-200">
            <div className="space-y-0.5">
              <h2 className="text-xl font-bold tracking-tight text-neutral-100">
                {t('onboarding.stepCategories')}
              </h2>
              <p className="text-xs text-neutral-400">
                {t('onboarding.categoriesDesc')}
              </p>
            </div>

            <CategorySelector
              categories={categories}
              selectedIds={selectedCategoryIds}
              onToggle={handleToggleCategory}
              onSelectAll={handleSelectAllCategories}
              onClearAll={handleClearAllCategories}
            />

            <div className="flex items-center justify-between gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep('WELCOME')}
                className="h-10 text-xs border-neutral-700 text-neutral-300 gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>{t('onboarding.back')}</span>
              </Button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onComplete}
                  className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  {t('onboarding.continueWithoutSync')}
                </button>

                <Button
                  onClick={handleSaveCategoriesAndAdvance}
                  disabled={selectedCategoryIds.size === 0 || isSavingCategories}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-10 px-5 text-xs rounded-xl shadow-md gap-1.5"
                >
                  {isSavingCategories ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <span>{t('onboarding.continueToBrowser')}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: CONNECT BROWSER COMPANION */}
        {/* ========================================================================= */}
        {currentStep === 'COMPANION' && (
          <div className="w-full space-y-5 animate-in fade-in-50 duration-200 text-left">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-neutral-100">
                {t('onboarding.stepCompanion')}
              </h2>
              <p className="text-xs text-neutral-400">
                {t('onboarding.companionSetupDesc')}
              </p>
            </div>

            {/* Method Selection (Built-in vs Companion) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTransportChoice('BUILT_IN')}
                className={cn(
                  'p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer',
                  transportChoice === 'BUILT_IN'
                    ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500'
                    : 'border-neutral-800 bg-neutral-950/60 hover:bg-neutral-900 hover:border-neutral-700'
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-neutral-100">
                      {t('settings.scraper.transportBuiltIn')}
                    </span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-mono">
                      {t('settings.scraper.methodRecommended')}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-normal">
                    {t('settings.scraper.builtInNotice')}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTransportChoice('COMPANION')}
                className={cn(
                  'p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer',
                  transportChoice === 'COMPANION'
                    ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500'
                    : 'border-neutral-800 bg-neutral-950/60 hover:bg-neutral-900 hover:border-neutral-700'
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-neutral-100">
                      {t('settings.scraper.transportCompanion')}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-normal">
                    {t('settings.scraper.transportCompanionDesc')}
                  </p>
                </div>
              </button>
            </div>

            {transportChoice === 'BUILT_IN' ? (
              <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-2.5 w-2.5 rounded-full shrink-0',
                        embeddedStatus === 'READY'
                          ? 'bg-emerald-400'
                          : embeddedStatus === 'VERIFICATION_REQUIRED'
                          ? 'bg-amber-400 animate-pulse'
                          : embeddedStatus === 'CHECKING'
                          ? 'bg-primary animate-spin'
                          : 'bg-neutral-500'
                      )}
                    />
                    <span className="text-xs font-medium text-neutral-200">
                      {embeddedStatus === 'READY'
                        ? t('settings.scraper.rutrackerAccessible')
                        : embeddedStatus === 'VERIFICATION_REQUIRED'
                        ? t('settings.scraper.rutrackerVerificationRequired')
                        : embeddedStatus === 'CHECKING'
                        ? t('onboarding.checkingAccess')
                        : t('settings.scraper.rutrackerUnknown')}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] font-mono',
                      embeddedStatus === 'READY'
                        ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                        : embeddedStatus === 'VERIFICATION_REQUIRED'
                        ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                        : 'border-neutral-700 text-neutral-400'
                    )}
                  >
                    {embeddedStatus}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleProbeEmbedded}
                    disabled={embeddedStatus === 'CHECKING'}
                    className="h-7 text-xs border-neutral-700 text-neutral-200 hover:text-white"
                  >
                    <RefreshCw className={cn('h-3 w-3 mr-1.5', embeddedStatus === 'CHECKING' && 'animate-spin')} />
                    <span>{t('settings.scraper.testAccess')}</span>
                  </Button>

                  {embeddedStatus === 'VERIFICATION_REQUIRED' && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleVerifyEmbedded}
                      className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium"
                    >
                      <ShieldCheck className="h-3 w-3 mr-1.5" />
                      <span>{t('settings.scraper.verifyNow')}</span>
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Temporary Connection Notice */}
                <TemporaryConnectionNotice />

                {/* Quick Helper Actions: Tutorial Modal & Open RuTracker in Browser */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsInstallModalOpen(true)}
                    className="h-9 px-3 text-xs border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 justify-start gap-2 cursor-pointer"
                  >
                    <HelpCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="font-medium truncate">{t('onboarding.howToInstallAndConnect')}</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openExternal(RUTRACKER_TARGET_FORUM_URL)}
                    className="h-9 px-3 text-xs border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200 justify-start gap-2 cursor-pointer"
                  >
                    <ExternalLink className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="font-medium truncate">{t('onboarding.openForumInBrowser')}</span>
                  </Button>
                </div>

                {/* Status Grid: Extension vs Current Session */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Extension Status */}
                  <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60 space-y-2">
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      {t('onboarding.extensionStatusTitle')}
                    </span>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-neutral-300" />
                        <span className="text-xs font-medium text-neutral-200">Browser Companion</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono border-neutral-700 text-neutral-300">
                        {companionStatus.port ? t('onboarding.extensionStatusInstalled') : t('onboarding.extensionStatusNotDetected')}
                      </Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsInstallModalOpen(true)}
                      className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 pt-1 cursor-pointer"
                    >
                      <HelpCircle className="h-3 w-3" />
                      <span>{t('onboarding.howToInstallAndConnect')}</span>
                    </button>
                  </div>

                  {/* Current Session Status */}
                  <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60 space-y-2">
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      {t('onboarding.sessionStatusTitle')}
                    </span>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {companionStatus.connected ? (
                          <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <ShieldAlert className="h-4 w-4 text-amber-400" />
                        )}
                        <span className="text-xs font-medium text-neutral-200">
                          {companionStatus.connected ? t('onboarding.sessionConnected') : t('onboarding.sessionDisconnected')}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-mono',
                          companionStatus.connected
                            ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                            : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                        )}
                      >
                        {companionStatus.connected ? 'OK' : 'DISCONNECTED'}
                      </Badge>
                    </div>
                    <div className="pt-1">
                      {!companionStatus.connected ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleConnectCompanion}
                          disabled={isConnectingCompanion}
                          className="h-7 w-full text-xs border-neutral-700 text-neutral-200 hover:text-white"
                        >
                          <RefreshCw className={cn('h-3 w-3 mr-1.5', isConnectingCompanion && 'animate-spin')} />
                          <span>{t('onboarding.companionConnectAction')}</span>
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                          <Check className="h-3.5 w-3.5" />
                          <span>{t('onboarding.connectedToSession')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Connection Code Display: ONLY when disconnected and port/token exist */}
                {!companionStatus.connected && companionStatus.port && (
                  <div className="text-xs font-mono bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-neutral-300 space-y-2 select-text">
                    <div className="flex items-center justify-between text-neutral-400">
                      <span className="text-[11px] font-sans font-semibold text-neutral-300">
                        {t('onboarding.connectionCodeTitle')}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-neutral-400 hover:text-white gap-1"
                        onClick={() => {
                          navigator.clipboard.writeText(`${companionStatus.port}:${companionStatus.token}`)
                          toast.success(t('common.copied'))
                        }}
                      >
                        <Copy className="h-3 w-3" />
                        <span>{t('common.copyAll')}</span>
                      </Button>
                    </div>

                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 gap-2">
                      <strong className="text-emerald-400 select-all cursor-text font-mono text-xs truncate">
                        {companionStatus.port}:{companionStatus.token}
                      </strong>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-neutral-400 hover:text-white shrink-0 gap-1"
                        onClick={() => {
                          navigator.clipboard.writeText(`${companionStatus.port}:${companionStatus.token}`)
                          toast.success(t('common.copied'))
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Navigation Actions */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep('CATEGORIES')}
                className="h-10 text-xs border-neutral-700 text-neutral-300 gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>{t('onboarding.back')}</span>
              </Button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onComplete}
                  className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  {t('onboarding.continueWithoutSync')}
                </button>

                <Button
                  onClick={handleAdvanceFromCompanion}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-10 px-5 text-xs rounded-xl shadow-md gap-1.5"
                >
                  <span>{transportChoice === 'BUILT_IN' && embeddedStatus === 'READY' ? t('onboarding.startSyncButton') : t('onboarding.nextCheckAccess')}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: CHECK ACCESS */}
        {/* ========================================================================= */}
        {currentStep === 'ACCESS' && (
          <div className="w-full space-y-5 animate-in fade-in-50 duration-200 text-left">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-neutral-100">
                {t('onboarding.accessCheckTitle')}
              </h2>
              <p className="text-xs text-neutral-400">
                {t('onboarding.accessCheckDesc')}
              </p>
            </div>

            {transportChoice === 'BUILT_IN' ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60 space-y-2">
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    {t('onboarding.accessInstructionBuiltIn')}
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleProbeEmbedded}
                      disabled={embeddedStatus === 'CHECKING'}
                      className="h-8 text-xs border-neutral-700 hover:border-emerald-500/50 hover:bg-neutral-800 text-neutral-200 gap-1.5"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', embeddedStatus === 'CHECKING' && 'animate-spin')} />
                      <span>{embeddedStatus === 'CHECKING' ? t('onboarding.checkingAccessProgress') : t('settings.scraper.testAccess')}</span>
                    </Button>

                    {embeddedStatus === 'VERIFICATION_REQUIRED' && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleVerifyEmbedded}
                        className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium gap-1.5"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>{t('settings.scraper.verifyNow')}</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Built-in Status Feedback */}
                <div
                  className={cn(
                    'p-3.5 rounded-xl border text-xs space-y-1',
                    embeddedStatus === 'READY'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : embeddedStatus === 'VERIFICATION_REQUIRED'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                      : 'border-neutral-800 bg-neutral-950/60 text-neutral-300'
                  )}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {embeddedStatus === 'READY' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : embeddedStatus === 'VERIFICATION_REQUIRED' ? (
                      <AlertCircle className="h-4 w-4 text-amber-400" />
                    ) : (
                      <HelpCircle className="h-4 w-4 text-neutral-400" />
                    )}
                    <span>
                      {embeddedStatus === 'READY'
                        ? t('settings.scraper.rutrackerAccessible')
                        : embeddedStatus === 'VERIFICATION_REQUIRED'
                        ? t('settings.scraper.rutrackerVerificationRequired')
                        : embeddedStatus === 'CHECKING'
                        ? t('onboarding.checkingAccess')
                        : t('settings.scraper.rutrackerUnknown')}
                    </span>
                  </div>
                </div>

                {/* Ready Summary Checklist */}
                <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/40 space-y-2">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {t('onboarding.accessReadySummary')}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-neutral-200">
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{t('settings.scraper.transportBuiltIn')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-neutral-200">
                      <Check className={cn('h-3.5 w-3.5', embeddedStatus === 'READY' ? 'text-emerald-400' : 'text-neutral-500')} />
                      <span>{t('onboarding.accessSummaryForum')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-neutral-200">
                      <Check className={cn('h-3.5 w-3.5', selectedCategoryIds.size > 0 ? 'text-emerald-400' : 'text-neutral-500')} />
                      <span>{t('onboarding.accessSummaryCategories', { count: selectedCategoryIds.size })}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60 space-y-2">
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    {t('onboarding.accessInstruction')}
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleOpenBrowser}
                      className="h-8 text-xs border-neutral-700 hover:border-emerald-500/50 hover:bg-neutral-800 text-neutral-200 gap-1.5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>{t('onboarding.openRuTracker')}</span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCheckCompanionAccess}
                      disabled={isCheckingCompanionAccess}
                      className="h-8 text-xs border-neutral-700 hover:border-emerald-500/50 hover:bg-neutral-800 text-neutral-200 gap-1.5"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', isCheckingCompanionAccess && 'animate-spin')} />
                      <span>{isCheckingCompanionAccess ? t('onboarding.checkingAccessProgress') : t('onboarding.checkAccess')}</span>
                    </Button>
                  </div>
                </div>

                {/* Access Status Feedback */}
                <div
                  className={cn(
                    'p-3.5 rounded-xl border text-xs space-y-1',
                    humanAccess.isOk
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : humanAccess.isWarning
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                      : 'border-neutral-800 bg-neutral-950/60 text-neutral-300'
                  )}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {humanAccess.isOk ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-400" />
                    )}
                    <span>{humanAccess.text}</span>
                  </div>
                </div>

                {/* Ready Summary Checklist */}
                <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/40 space-y-2">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {t('onboarding.accessReadySummary')}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-neutral-200">
                      <Check className={cn('h-3.5 w-3.5', companionStatus.connected ? 'text-emerald-400' : 'text-neutral-500')} />
                      <span>{t('onboarding.accessSummaryBrowser')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-neutral-200">
                      <Check className={cn('h-3.5 w-3.5', isCompanionReady ? 'text-emerald-400' : 'text-neutral-500')} />
                      <span>{t('onboarding.accessSummaryForum')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-neutral-200">
                      <Check className={cn('h-3.5 w-3.5', selectedCategoryIds.size > 0 ? 'text-emerald-400' : 'text-neutral-500')} />
                      <span>{t('onboarding.accessSummaryCategories', { count: selectedCategoryIds.size })}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              <Button
                onClick={handleStartInitialScan}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-11 text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Play className="h-4 w-4 fill-white" />
                <span>{t('onboarding.startSyncButton')}</span>
              </Button>

              <div className="flex items-center justify-between text-xs text-neutral-400">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentStep('COMPANION')}
                  className="h-8 text-neutral-400 hover:text-neutral-200 gap-1"
                >
                  <ArrowLeft className="h-3 w-3" />
                  <span>{t('onboarding.back')}</span>
                </Button>

                <button
                  type="button"
                  onClick={onComplete}
                  className="hover:text-neutral-200 transition-colors"
                >
                  {t('onboarding.continueWithoutSync')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 5: INITIAL SYNC (UNIFIED PROGRESS UI) */}
        {/* ========================================================================= */}
        {currentStep === 'SYNC' && (
          <div className="w-full space-y-4 animate-in fade-in-50 duration-200 text-left">
            {/* Header with Engine & Phase Badges */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                <span className={cn('h-2 w-2 rounded-full', isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500')} />
                <span>
                  {transportChoice === 'BUILT_IN'
                    ? `${t('settings.scraper.transportBuiltIn')} (RuTracker Session)`
                    : 'Browser Companion'}
                </span>
                <span className="text-emerald-500/40">·</span>
                <span className="text-neutral-300">
                  {scraperState.state === 'preflight'
                    ? 'Preflight'
                    : scraperState.state === 'verifying'
                    ? 'Verifying session'
                    : scraperState.state === 'interaction_required'
                    ? 'Verification required'
                    : scraperState.state === 'starting'
                    ? 'Starting'
                    : scraperState.state === 'paused'
                    ? 'Paused'
                    : isRunning
                    ? 'Active Sync'
                    : 'Ready'}
                </span>
              </div>

              <h2 className="text-xl font-bold tracking-tight text-neutral-100">
                {t('onboarding.buildingLibrary')}
              </h2>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                {scraperState.state === 'interaction_required'
                  ? t('onboarding.syncStatusInteraction')
                  : scraperState.state === 'verifying'
                  ? t('onboarding.syncStatusVerifying')
                  : scraperState.state === 'preflight'
                  ? t('onboarding.syncStatusPreflight')
                  : progress?.categoryName
                  ? `${progress.categoryName} · Page ${progress.currentPage || 1} ${progress.totalPages ? `/ ${progress.totalPages}` : ''}`
                  : t('onboarding.synchronizing')}
              </p>
            </div>

            {/* If idle with no progress yet, show helpful starting card */}
            {scraperState.state === 'idle' && !progress && (
              <div className="bg-neutral-950/60 rounded-xl border border-neutral-800 p-6 flex flex-col items-center justify-center space-y-3 text-center">
                <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-neutral-200 block">
                    {t('onboarding.syncConnectingSessionTitle')}
                  </span>
                  <span className="text-[11px] text-neutral-400 block">
                    {t('onboarding.syncConnectingSessionDesc')}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleStartInitialScan}
                  className="h-8 text-xs border-emerald-500/40 text-emerald-300 mt-2 gap-1.5"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>{t('onboarding.startSyncButton')}</span>
                </Button>
              </div>
            )}

            <ScraperProgress
              state={scraperState.state}
              progress={progress}
              error={(scraperState as any).error}
              accessIssue={
                transportChoice === 'BUILT_IN' && scraperState.state === 'interaction_required'
                  ? {
                      categoryId: (scraperState as any).details?.categoryId || null,
                      categoryName: (scraperState as any).details?.categoryName || progress?.categoryName || '',
                      url: '',
                      status: 'INTERACTION_REQUIRED',
                      httpStatus: 403,
                      challengeDetected: true,
                      authenticationRequired: false,
                      checkedAt: new Date().toISOString(),
                      message: (scraperState as any).error || 'RuTracker Cloudflare verification required',
                      transport: 'EMBEDDED_ELECTRON',
                    }
                  : companionAccessResult && companionAccessResult.status !== 'FORUM_READY'
                  ? {
                      categoryId: null,
                      categoryName: progress?.categoryName || '',
                      url: '',
                      status: (companionAccessResult.status === 'CHALLENGE_REQUIRED' ? 'INTERACTION_REQUIRED' : companionAccessResult.status as any) || 'UNKNOWN',
                      httpStatus: null,
                      challengeDetected: companionAccessResult.status === 'CHALLENGE_REQUIRED',
                      authenticationRequired: companionAccessResult.status === 'AUTH_REQUIRED',
                      checkedAt: new Date().toISOString(),
                      message: companionAccessResult.error || companionAccessResult.status || '',
                    }
                  : null
              }
              onCancel={handleCancelScan}
              onPause={handlePauseScan}
              onResume={handleResumeScan}
              isPausing={isPausing}
              isResuming={isResuming}
              onRenewSession={handleStartInitialScan}
              onOpenBrowser={handleOpenBrowser}
              onCheckAccess={handleCheckCompanionAccess}
              onReconnect={handleConnectCompanion}
              onVerifyEmbedded={handleVerifyEmbedded}
              activeTransport={transportChoice === 'BUILT_IN' ? 'EMBEDDED_ELECTRON' : 'BROWSER_COMPANION'}
              isStarting={scraperState.state === 'starting' || scraperState.state === 'preflight' || scraperState.state === 'verifying'}
            />

            {/* Real-time Activity Feed / Terminal Preview */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 overflow-hidden shadow-inner">
              <div 
                className="flex items-center justify-between px-3.5 py-2 border-b border-neutral-800 bg-neutral-900/40 cursor-pointer select-none"
                onClick={() => setIsLogExpanded((prev) => !prev)}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
                  <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{t('onboarding.activityFeedTitle')}</span>
                  {isRunning && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                  <span className="font-mono">{t('onboarding.activityFeedEvents', { count: recentLogs.length })}</span>
                  {isLogExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-neutral-400" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
                  )}
                </div>
              </div>

              {isLogExpanded && (
                <div
                  ref={logContainerRef}
                  className="p-3 font-mono text-[11px] max-h-32 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-neutral-800 text-left"
                >
                  {recentLogs.length === 0 ? (
                    <div className="text-neutral-500 text-xs italic py-1 flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                      <span>
                        {transportChoice === 'BUILT_IN'
                          ? 'Starting autonomous Electron scraper & establishing session...'
                          : 'Connecting to Browser Companion & validating RuTracker tab...'}
                      </span>
                    </div>
                  ) : (
                    recentLogs.map((log, idx) => {
                      const timeStr = log.timestamp
                        ? new Date(log.timestamp).toLocaleTimeString()
                        : '—'
                      const isWarn = log.level === 'warn'
                      const isErr = log.level === 'error'

                      return (
                        <div key={idx} className="flex items-start gap-2 leading-relaxed">
                          <span className="text-neutral-500 shrink-0 select-none">
                            [{timeStr}]
                          </span>
                          <span
                            className={cn(
                              'break-all',
                              isErr
                                ? 'text-rose-400'
                                : isWarn
                                ? 'text-amber-400'
                                : 'text-neutral-300'
                            )}
                          >
                            {log.message}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>

            {isRunning ? (
              <div className="flex flex-col items-center gap-2 pt-2 border-t border-neutral-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBrowseLibrary}
                  className="h-8 text-xs border-neutral-700 hover:border-neutral-600 text-neutral-200 gap-1.5 cursor-pointer"
                >
                  <Database className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{t('onboarding.browseLibrary')}</span>
                </Button>
                <span className="text-[11px] text-neutral-400 text-center">
                  {t('onboarding.syncContinuesInBackground')}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-neutral-400 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStartInitialScan}
                  className="h-8 text-xs border-emerald-500/40 text-emerald-300 gap-1.5"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>{t('settings.scraper.resumeSync')}</span>
                </Button>

                <button
                  type="button"
                  onClick={onComplete}
                  className="hover:text-neutral-200 transition-colors cursor-pointer"
                >
                  {t('onboarding.continueWithoutSync')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 6: READY */}
        {/* ========================================================================= */}
        {currentStep === 'READY' && (
          <div className="w-full space-y-6 pt-2 animate-in zoom-in-95 duration-200">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 flex flex-col items-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-neutral-100">
                  {t('onboarding.readyTitle')}
                </h3>
                <p className="text-xs text-neutral-300">
                  {t('onboarding.readySummary', {
                    items: completedStats.items,
                    categories: completedStats.categories,
                  })}
                </p>
              </div>
            </div>

            <Button
              onClick={onComplete}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-12 text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center cursor-pointer transition-all gap-2"
            >
              <span>{t('onboarding.openLibraryButton')}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Extension Install Instructions & Mini-Tutorial Modal */}
      <Dialog open={isInstallModalOpen} onOpenChange={setIsInstallModalOpen}>
        <DialogContent className="max-w-lg bg-neutral-900 border-neutral-800 text-neutral-100 p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Globe className="h-5 w-5 text-emerald-400" />
              <span>{t('onboarding.installInstructionsTitle')}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
            {/* Step 1: Install Extension */}
            <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-2">
              <div className="font-semibold text-neutral-200 flex items-center gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">1</span>
                <span>{t('onboarding.installStep1Title')}</span>
              </div>
              <div className="pl-7 space-y-1 text-neutral-300 text-[11px]">
                <p>{t('onboarding.installStep1')}</p>
                <p>{t('onboarding.installStep2')}</p>
                <p>{t('onboarding.installStep3')}</p>
                <div className="pt-1">
                  <span className="text-neutral-400 text-[10px]">{t('onboarding.installFolderLabel')}</span>
                  <div className="font-mono text-emerald-400 bg-neutral-900 border border-neutral-800 px-2 py-1 rounded mt-0.5 text-[11px] select-all">
                    browser-companion/dist
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Open Forum in Browser */}
            <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-2">
              <div className="font-semibold text-neutral-200 flex items-center gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-mono font-bold">2</span>
                <span>{t('onboarding.installStep2Title')}</span>
              </div>
              <div className="pl-7 space-y-2 text-neutral-300 text-[11px]">
                <p>{t('onboarding.installStepRuTracker')}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openExternal(RUTRACKER_TARGET_FORUM_URL)}
                  className="w-full h-8 text-xs border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200 gap-2 cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-blue-400" />
                  <span>{t('onboarding.openForumInBrowser')} (f=548)</span>
                </Button>
              </div>
            </div>

            {/* Step 3: Connect Extension */}
            <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-2">
              <div className="font-semibold text-neutral-200 flex items-center gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-mono font-bold">3</span>
                <span>{t('onboarding.installStep3Title')}</span>
              </div>
              <div className="pl-7 space-y-2 text-neutral-300 text-[11px]">
                <p>{t('onboarding.installStep4')}</p>
                <p>{t('onboarding.installStep5')}</p>
                {companionStatus.port && companionStatus.token && (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-900 border border-neutral-800 gap-2 font-mono text-[11px]">
                    <span className="text-emerald-400 truncate select-all">
                      {companionStatus.port}:{companionStatus.token}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-neutral-400 hover:text-white shrink-0 gap-1 cursor-pointer"
                      onClick={() => {
                        navigator.clipboard.writeText(`${companionStatus.port}:${companionStatus.token}`)
                        toast.success(t('common.copied'))
                      }}
                    >
                      <Copy className="h-3 w-3" />
                      <span>{t('common.copyAll')}</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-1">
            <Button
              type="button"
              onClick={() => setIsInstallModalOpen(false)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium h-9 text-xs rounded-xl cursor-pointer"
            >
              <span>{t('common.close')}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
