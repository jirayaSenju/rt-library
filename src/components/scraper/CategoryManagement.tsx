import React, { useState, useEffect, useMemo } from 'react';
import {
  ScraperCategory,
  ScraperCategoryGroup,
} from '@/types/scraper';
import { scraperService } from '@/services/scraperService';
import { CategoryEditorModal } from './CategoryEditorModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus,
  Edit2,
  Trash2,
  RotateCcw,
  ExternalLink,
  Layers,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { toast } from 'sonner';

const GROUP_COLORS: Record<ScraperCategoryGroup, { bg: string; text: string; border: string }> = {
  nintendo: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  playstation: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  xbox: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  sega: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  other: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
};

interface CategoryManagementProps {
  onBack?: () => void;
}

export const CategoryManagement: React.FC<CategoryManagementProps> = ({ onBack }) => {
  const { t } = useI18n();
  const [categories, setCategories] = useState<ScraperCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ScraperCategory | null>(null);

  const [deletingCategory, setDeletingCategory] = useState<ScraperCategory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [resettingCategory, setResettingCategory] = useState<ScraperCategory | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const loadCategories = async () => {
    try {
      setIsLoading(true);
      const data = await scraperService.getCategories();
      setCategories(data);
    } catch (err: any) {
      console.error('Failed to load scraper categories:', err);
      toast.error(err.message || 'Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleToggleEnabled = async (category: ScraperCategory) => {
    const nextState = !category.enabled;
    try {
      await scraperService.setCategoryEnabled(category.id, nextState);
      setCategories((prev) =>
        prev.map((c) => (c.id === category.id ? { ...c, enabled: nextState } : c))
      );
      toast.success(
        nextState
          ? t('categories.enabledSuccessToast', { name: category.name })
          : t('categories.disabledSuccessToast', { name: category.name })
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle category');
    }
  };

  const handleOpenAddModal = () => {
    setEditingCategory(null);
    setIsEditorOpen(true);
  };

  const handleOpenEditModal = (category: ScraperCategory) => {
    setEditingCategory(category);
    setIsEditorOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCategory) return;
    try {
      setIsDeleting(true);
      await scraperService.deleteCategory(deletingCategory.id);
      toast.success(t('categories.deletedSuccessToast', { name: deletingCategory.name }));
      setDeletingCategory(null);
      await loadCategories();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete category');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!resettingCategory) return;
    try {
      setIsResetting(true);
      await scraperService.resetCategory(resettingCategory.id);
      toast.success(t('categories.resetSuccessToast', { name: resettingCategory.name }));
      setResettingCategory(null);
      await loadCategories();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset category');
    } finally {
      setIsResetting(false);
    }
  };

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(q) ||
        cat.id.toLowerCase().includes(q) ||
        cat.group.toLowerCase().includes(q) ||
        cat.titleSearch.some((p) => p.toLowerCase().includes(q))
    );
  }, [categories, searchQuery]);

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header with Back button, Title & Add Category Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0 mr-1"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              {t('settings.scraperTab')}
            </Button>
          )}
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              {t('categories.managementTitle')}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('categories.managementDescription')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={handleOpenAddModal}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-sm h-8 px-3 text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('categories.addCategoryBtn')}
          </Button>
        </div>
      </div>

      {/* Search Filter Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('categories.fields.titlePatterns') + ' / ' + t('common.search')}
          className="pl-8 h-9 text-xs bg-background/80 border-border"
        />
      </div>

      {/* Categories List */}
      {isLoading ? (
        <div className="flex items-center justify-center p-8 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-xs">{t('common.loading')}</span>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-border rounded-xl">
          <p className="text-xs text-muted-foreground">{t('categories.emptyList')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCategories.map((cat) => {
            const groupStyle = GROUP_COLORS[cat.group] || GROUP_COLORS.other;
            const hasOverrides = cat.builtIn && cat.updatedAt;

            return (
              <div
                key={cat.id}
                className={cn(
                  "p-3 rounded-xl border transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3",
                  cat.enabled
                    ? "bg-card/70 border-border hover:border-border/80"
                    : "bg-muted/30 border-border/40 opacity-60 hover:opacity-80"
                )}
              >
                {/* Left info column */}
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-foreground truncate">
                      {cat.name}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono border-border text-muted-foreground">
                      {cat.id}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] uppercase font-bold", groupStyle.bg, groupStyle.text, groupStyle.border)}
                    >
                      {cat.group}
                    </Badge>
                    {cat.builtIn ? (
                      <Badge variant="secondary" className="text-[10px] bg-secondary text-muted-foreground border border-border/50">
                        {t('categories.badges.builtin')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border border-primary/20">
                        {t('categories.badges.custom')}
                      </Badge>
                    )}
                    {hasOverrides && (
                      <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {t('categories.badges.modified')}
                      </Badge>
                    )}
                  </div>

                  {/* Forum URL & Patterns */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <a
                      href={cat.baseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary flex items-center gap-1 font-mono text-[11px] hover:underline"
                    >
                      <span className="truncate max-w-[280px] sm:max-w-xs">{cat.baseUrl}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>

                    {/* Title patterns preview */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[11px] text-muted-foreground/80">{t('categories.fields.titlePatterns')}:</span>
                      {(cat.titleSearch || []).map((pattern, pIdx) => (
                        <span
                          key={`row-pattern-${pIdx}`}
                          className="bg-secondary/80 text-foreground text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60"
                        >
                          {pattern}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right actions column */}
                <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                  <div className="flex items-center gap-1.5 mr-2">
                    <Switch
                      checked={cat.enabled}
                      onCheckedChange={() => handleToggleEnabled(cat)}
                      aria-label={`Alternar status de ${cat.name}`}
                    />
                    <span className="text-[11px] text-muted-foreground min-w-[50px]">
                      {cat.enabled ? t('categories.fields.enabled') : t('categories.fields.disabled')}
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEditModal(cat)}
                    className="h-8 px-2.5 text-xs border-border text-foreground hover:bg-secondary"
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    {t('common.edit')}
                  </Button>

                  {cat.builtIn && hasOverrides && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setResettingCategory(cat)}
                      title={t('categories.restoreDefault')}
                      className="h-8 px-2 text-xs text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {!cat.builtIn && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingCategory(cat)}
                      title={t('categories.deleteCategory')}
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Category Editor Modal */}
      <CategoryEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        category={editingCategory}
        onSaveSuccess={loadCategories}
      />

      {/* Delete Confirmation Dialog */}
      {deletingCategory && (
        <Dialog open={Boolean(deletingCategory)} onOpenChange={(open) => !open && setDeletingCategory(null)}>
          <DialogContent className="max-w-md bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                {t('categories.deleteModal.title', { name: deletingCategory.name })}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground pt-2 space-y-1.5">
                <p>{t('categories.deleteModal.body1')}</p>
                <p className="text-foreground font-medium">{t('categories.deleteModal.body2')}</p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeletingCategory(null)}
                disabled={isDeleting}
                className="border-border text-foreground hover:bg-secondary"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="font-medium"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    {t('common.deleting')}
                  </>
                ) : (
                  t('categories.deleteModal.confirmBtn')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reset Confirmation Dialog */}
      {resettingCategory && (
        <Dialog open={Boolean(resettingCategory)} onOpenChange={(open) => !open && setResettingCategory(null)}>
          <DialogContent className="max-w-md bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-amber-400" />
                {t('categories.resetModal.title', { name: resettingCategory.name })}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground pt-2">
                {t('categories.resetModal.body')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResettingCategory(null)}
                disabled={isResetting}
                className="border-border text-foreground hover:bg-secondary"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="bg-amber-600 hover:bg-amber-500 text-white font-semibold"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    {t('common.resetting')}
                  </>
                ) : (
                  t('categories.resetModal.confirmBtn')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
