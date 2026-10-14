import React, { useMemo } from 'react'
import { Check, CheckSquare, Square } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScraperCategory, ScraperCategoryGroup } from '@/types/scraper'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const GROUP_LABELS: Record<ScraperCategoryGroup, string> = {
  nintendo: 'Nintendo',
  playstation: 'PlayStation',
  xbox: 'Xbox',
  sega: 'Sega',
  other: 'Other',
}

const GROUP_COLORS: Record<ScraperCategoryGroup, { bg: string; text: string; border: string }> = {
  nintendo: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  playstation: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  xbox: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  sega: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  other: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
}

interface CategorySelectorProps {
  categories: ScraperCategory[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClearAll: () => void
  disabled?: boolean
  className?: string
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  categories,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  disabled = false,
  className,
}) => {
  const { t } = useI18n()

  const grouped = useMemo(() => {
    const map = new Map<ScraperCategoryGroup, ScraperCategory[]>()
    const groupOrder: ScraperCategoryGroup[] = ['nintendo', 'playstation', 'xbox', 'sega', 'other']
    groupOrder.forEach((g) => map.set(g, []))

    for (const cat of categories) {
      const g = (cat.group || 'other') as ScraperCategoryGroup
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(cat)
    }

    return Array.from(map.entries()).filter(([_, list]) => list.length > 0)
  }, [categories])

  const selectedCount = selectedIds.size

  const majorGroups = useMemo(() => grouped.filter(([_, cats]) => cats.length >= 4), [grouped])
  const minorGroups = useMemo(() => grouped.filter(([_, cats]) => cats.length < 4), [grouped])

  const renderCategoryCard = (cat: ScraperCategory) => {
    const isChecked = selectedIds.has(cat.id)

    return (
      <div
        key={cat.id}
        role="checkbox"
        aria-checked={isChecked}
        aria-label={cat.name}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onToggle(cat.id)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault()
            onToggle(cat.id)
          }
        }}
        className={cn(
          'flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-all outline-none',
          'hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary',
          isChecked
            ? 'border-emerald-500/50 bg-emerald-500/10 text-foreground'
            : 'border-border/60 bg-card/60 text-muted-foreground hover:text-foreground'
        )}
      >
        <div className="flex items-center gap-2 min-w-0 pr-1">
          <div
            className={cn(
              'h-3.5 w-3.5 rounded flex items-center justify-center border transition-colors shrink-0',
              isChecked
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'border-muted-foreground/40 bg-secondary/50'
            )}
            aria-hidden="true"
          >
            {isChecked && <Check className="h-2.5 w-2.5 stroke-[3]" />}
          </div>
          <span className="font-medium text-[11px] truncate">{cat.name}</span>
        </div>
      </div>
    )
  }

  const renderGroupHeader = (group: ScraperCategoryGroup, cats: ScraperCategory[]) => {
    const colors = GROUP_COLORS[group] || GROUP_COLORS.other
    const groupName = GROUP_LABELS[group] || group

    return (
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', colors.bg, colors.text, colors.border)}>
          {groupName}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">
          ({cats.filter((c) => selectedIds.has(c.id)).length}/{cats.length})
        </span>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3 text-left select-none', className)}>
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'text-xs font-mono px-2 py-0.5',
              selectedCount > 0
                ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
            )}
          >
            {t('onboarding.selectedCategoriesCount', { count: selectedCount })}
          </Badge>
          {selectedCount === 0 && (
            <span className="text-[11px] text-amber-400 font-medium">
              {t('onboarding.zeroCategoriesWarning')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            disabled={disabled || selectedCount === categories.length}
            className="h-7 px-2.5 text-xs text-foreground hover:text-white"
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1" />
            <span>{t('onboarding.selectAll')}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            disabled={disabled || selectedCount === 0}
            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Square className="h-3.5 w-3.5 mr-1" />
            <span>{t('onboarding.clearSelection')}</span>
          </Button>
        </div>
      </div>

      {/* Categories Content: No inner scrollbar */}
      <div className="space-y-3">
        {/* Major Groups (Nintendo, PlayStation) in 4 columns */}
        {majorGroups.map(([group, cats]) => (
          <div key={group} className="space-y-1">
            {renderGroupHeader(group, cats)}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
              {cats.map(renderCategoryCard)}
            </div>
          </div>
        ))}

        {/* Minor Groups (Xbox, Sega, etc.) side-by-side in 2-column layout */}
        {minorGroups.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-0.5">
            {minorGroups.map(([group, cats]) => (
              <div key={group} className="space-y-1">
                {renderGroupHeader(group, cats)}
                <div className="grid grid-cols-2 gap-1.5">
                  {cats.map(renderCategoryCard)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
