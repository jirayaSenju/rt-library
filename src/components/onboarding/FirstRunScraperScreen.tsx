import React, { useState, useEffect, useCallback } from 'react'
import {
  Gamepad2,
  RefreshCw,
  SlidersHorizontal,
  Play,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  XCircle,
  Database,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CategoryManagement } from '@/components/scraper/CategoryManagement'
import { scraperService, ScraperManagerStatus } from '@/services/scraperService'
import { nativeLibraryService } from '@/services/nativeLibrary'
import { useI18n } from '@/i18n'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface FirstRunScraperScreenProps {
  onComplete: () => void
}

export const FirstRunScraperScreen: React.FC<FirstRunScraperScreenProps> = ({ onComplete }) => {
  const { t } = useI18n()
  const [categoriesCount, setCategoriesCount] = useState<number>(16)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false)

  const [scraperState, setScraperState] = useState<ScraperManagerStatus>({
    state: 'idle',
    isRunning: false,
    progress: null,
    logs: [],
    startTime: null,
  })

  const [isRenewingSession, setIsRenewingSession] = useState(false)
  const [isScanCompleted, setIsScanCompleted] = useState(false)
  const [completedStats, setCompletedStats] = useState<{ items: number; categories: number }>({
    items: 0,
    categories: 0,
  })

  const loadCategoriesInfo = useCallback(async () => {
    try {
      const cats = await scraperService.getCategories()
      const enabled = cats.filter((c) => c.enabled !== false)
      setCategoriesCount(enabled.length)
    } catch (_) {}
  }, [])

  useEffect(() => {
    loadCategoriesInfo()
    scraperService.getState().then(setScraperState).catch(() => {})

    const unregState = scraperService.onStateChanged((stateData: any) => {
      setScraperState((prev: ScraperManagerStatus) => ({
        ...prev,
        state: stateData.state,
        isRunning: ['starting', 'running', 'cancelling'].includes(stateData.state),
      }))

      if (stateData.state === 'completed') {
        nativeLibraryService.getReadiness().then((r) => {
          if (r.itemCount > 0) {
            setCompletedStats({
              items: r.itemCount,
              categories: r.categoriesCount || 0,
            })
            setIsScanCompleted(true)
          }
        })
      }
    })

    const unregProgress = scraperService.onProgress((prog: any) => {
      setScraperState((prev: ScraperManagerStatus) => ({
        ...prev,
        progress: prog,
      }))
    })

    return () => {
      unregState()
      unregProgress()
    }
  }, [loadCategoriesInfo])

  const handleRenewSession = async () => {
    try {
      setIsRenewingSession(true)
      await scraperService.renewSession()
      toast.info(t('onboarding.sessionRenewLaunched') || 'Verificação de sessão iniciada no navegador.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRenewingSession(false)
    }
  }

  const handleStartInitialScan = async () => {
    try {
      setIsScanCompleted(false)
      await scraperService.start({ full: false, headless: true })
      toast.info(t('onboarding.scanStarted') || 'Sincronização inicial iniciada.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const handleCancelScan = async () => {
    try {
      await scraperService.cancel()
      toast.info(t('onboarding.scanCancelled') || 'Cancelamento solicitado.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const isRunning = scraperState.isRunning
  const progress = scraperState.progress
  const percent =
    progress && (progress.totalPages ?? 0) > 0
      ? Math.round(((progress.currentPage ?? 0) / progress.totalPages!) * 100)
      : 0

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 select-none relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-2xl w-full bg-neutral-900/90 border border-neutral-800 p-8 rounded-2xl shadow-2xl backdrop-blur-md relative z-10 flex flex-col items-center text-center space-y-6">
        {/* Header Icon & Title */}
        <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/10">
          <Gamepad2 className="h-9 w-9" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">
            {t('onboarding.firstRunTitle') || 'RT Library'}
          </h1>
          <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
            {t('onboarding.firstRunDesc') ||
              'Sua biblioteca ainda está vazia. Conecte o scraper ao RuTracker e faça sua primeira sincronização para carregar o catálogo de jogos.'}
          </p>
        </div>

        {!isScanCompleted ? (
          <div className="w-full space-y-4 pt-2">
            {/* Status Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
              {/* Session Card */}
              <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {scraperState.state === 'session_required' ? (
                      <ShieldAlert className="h-4 w-4 text-amber-400" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    )}
                    <span className="text-xs font-semibold text-neutral-200">
                      {t('onboarding.sessionTitle') || 'Sessão RuTracker'}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] font-mono uppercase tracking-wider',
                      scraperState.state === 'session_required'
                        ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                        : 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                    )}
                  >
                    {scraperState.state === 'session_required'
                      ? t('onboarding.sessionRequired') || 'Ação necessária'
                      : t('onboarding.sessionReady') || 'Pronto / Conectado'}
                  </Badge>
                </div>
                <p className="text-[11px] text-neutral-400">
                  {t('onboarding.sessionDesc') ||
                    'Verifique sua conexão ao RuTracker. Não é obrigatório possuir conta cadastrada.'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRenewSession}
                  disabled={isRunning || isRenewingSession}
                  className="w-full h-8 text-xs border-neutral-700 hover:border-emerald-500/50 hover:bg-neutral-800 text-neutral-200 gap-1.5"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', isRenewingSession && 'animate-spin')} />
                  <span>{t('onboarding.verifySession') || 'Verificar / Conectar'}</span>
                </Button>
              </div>

              {/* Categories Card */}
              <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Database className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-neutral-200">
                      {t('onboarding.categoriesTitle') || 'Categorias'}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                  >
                    {categoriesCount} {t('onboarding.activeCategories') || 'ativas'}
                  </Badge>
                </div>
                <p className="text-[11px] text-neutral-400">
                  {t('onboarding.categoriesDesc') ||
                    'Defina quais consoles e plataformas serão sincronizados no banco de dados SQLite.'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCategoryModalOpen(true)}
                  disabled={isRunning}
                  className="w-full h-8 text-xs border-neutral-700 hover:border-emerald-500/50 hover:bg-neutral-800 text-neutral-200 gap-1.5"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>{t('onboarding.configureCategories') || 'Configurar Categorias'}</span>
                </Button>
              </div>
            </div>

            {/* Scan Progress State */}
            {isRunning && (
              <div className="bg-neutral-950/80 border border-emerald-500/30 rounded-xl p-4 space-y-3 animate-in fade-in duration-200 text-left">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 text-emerald-400 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      {progress?.categoryName
                        ? `${t('onboarding.scanning') || 'Sincronizando'}: ${progress.categoryName}`
                        : t('onboarding.synchronizing') || 'Sincronizando catálogo...'}
                    </span>
                  </div>
                  <span className="font-mono text-neutral-400">
                    {progress ? `${progress.currentPage} / ${progress.totalPages || '?'}` : ''}
                  </span>
                </div>

                <Progress value={percent} className="h-2 bg-neutral-800" />

                <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                  <span>
                    {t('onboarding.itemsSaved') || 'Salvos no SQLite'}:{' '}
                    <strong className="text-neutral-200 font-mono">{progress?.totalItems || 0}</strong>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelScan}
                    className="h-6 px-2 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    {t('common.cancel') || 'Cancelar'}
                  </Button>
                </div>
              </div>
            )}

            {/* Main Action Button */}
            {!isRunning && (
              <Button
                onClick={handleStartInitialScan}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-12 text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center cursor-pointer transition-all"
              >
                <Play className="h-4 w-4 mr-2 fill-white" />
                {t('onboarding.startInitialScan') || 'Iniciar Sincronização Inicial'}
              </Button>
            )}
          </div>
        ) : (
          /* Completion State */
          <div className="w-full space-y-5 pt-2 animate-in zoom-in-95 duration-200">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 flex flex-col items-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-neutral-100">
                  {t('onboarding.catalogCreatedTitle') || 'Biblioteca inicial criada com sucesso!'}
                </h3>
                <p className="text-xs text-neutral-300">
                  {t('onboarding.catalogCreatedDesc', {
                    count: completedStats.items,
                    categories: completedStats.categories,
                  }) ||
                    `${completedStats.items} jogos catalogados em ${completedStats.categories} categorias.`}
                </p>
              </div>
            </div>

            <Button
              onClick={onComplete}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-12 text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center cursor-pointer transition-all gap-2"
            >
              <span>{t('onboarding.openLibrary') || 'Abrir Biblioteca'}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Category Management Modal */}
      <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-neutral-900 border-neutral-800 text-neutral-100">
          <DialogHeader>
            <DialogTitle>{t('categories.managementTitle') || 'Gerenciamento de Categorias'}</DialogTitle>
            <DialogDescription>
              {t('categories.managementDescription') ||
                'Adicione, edite ou alterne as categorias do RuTracker que serão rastreadas.'}
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <CategoryManagement />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
