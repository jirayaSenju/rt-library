import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ScraperCategory,
  ScraperCategoryGroup,
  CreateCategoryDTO,
  UpdateCategoryDTO,
  TestCategoryResult,
} from '@/types/scraper';
import { scraperService } from '@/services/scraperService';
import { useI18n } from '@/i18n';
import {
  Plus,
  X,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CategoryEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: ScraperCategory | null;
  onSaveSuccess: () => void;
}

const ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const CategoryEditorModal: React.FC<CategoryEditorModalProps> = ({
  isOpen,
  onClose,
  category,
  onSaveSuccess,
}) => {
  const { t } = useI18n();
  const isEditing = Boolean(category);

  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [isIdManuallyEdited, setIsIdManuallyEdited] = useState(false);
  const [group, setGroup] = useState<ScraperCategoryGroup>('other');
  const [baseUrl, setBaseUrl] = useState('');
  const [titlePatterns, setTitlePatterns] = useState<string[]>([]);
  const [newPatternInput, setNewPatternInput] = useState('');
  const [enabled, setEnabled] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestCategoryResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setId(category.id);
      setIsIdManuallyEdited(true);
      setGroup(category.group || 'other');
      setBaseUrl(category.baseUrl);
      setTitlePatterns([...category.titleSearch]);
      setEnabled(category.enabled);
    } else {
      setName('');
      setId('');
      setIsIdManuallyEdited(false);
      setGroup('other');
      setBaseUrl('');
      setTitlePatterns([]);
      setEnabled(true);
    }
    setNewPatternInput('');
    setTestResult(null);
    setValidationError(null);
  }, [category, isOpen]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!isEditing && !isIdManuallyEdited) {
      setId(slugify(val));
    }
  };

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsIdManuallyEdited(true);
    setId(e.target.value.toLowerCase().trim());
  };

  const handleAddPattern = () => {
    const trimmed = newPatternInput.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (titlePatterns.some((p) => p.toLowerCase() === lower)) {
      toast.warning(t('categories.validation.duplicatePattern'));
      return;
    }
    setTitlePatterns((prev) => [...prev, trimmed]);
    setNewPatternInput('');
  };

  const handleRemovePattern = (indexToRemove: number) => {
    setTitlePatterns((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleKeyDownPattern = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddPattern();
    }
  };

  const validateForm = (): boolean => {
    setValidationError(null);

    if (!name.trim()) {
      setValidationError(t('categories.validation.nameRequired'));
      return false;
    }

    if (!isEditing) {
      if (!id.trim()) {
        setValidationError(t('categories.validation.idRequired'));
        return false;
      }
      if (!ID_REGEX.test(id.trim())) {
        setValidationError(t('categories.validation.idInvalid'));
        return false;
      }
    }

    if (!baseUrl.trim()) {
      setValidationError(t('categories.validation.urlRequired'));
      return false;
    }

    try {
      const parsed = new URL(baseUrl.trim());
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'rutracker.org' || parsed.pathname !== '/forum/viewforum.php') {
        setValidationError(t('categories.validation.urlInvalid'));
        return false;
      }
      const fParam = parsed.searchParams.get('f');
      if (!fParam || !/^\d+$/.test(fParam) || parseInt(fParam, 10) <= 0) {
        setValidationError(t('categories.validation.urlInvalidForumId'));
        return false;
      }
    } catch (_) {
      setValidationError(t('categories.validation.urlInvalid'));
      return false;
    }

    if (titlePatterns.length === 0) {
      setValidationError(t('categories.validation.patternsRequired'));
      return false;
    }

    return true;
  };

  const handleTestCategory = async () => {
    if (!baseUrl.trim()) {
      setValidationError(t('categories.validation.urlRequired'));
      return;
    }
    if (titlePatterns.length === 0 && !newPatternInput.trim()) {
      setValidationError(t('categories.validation.patternsRequired'));
      return;
    }

    const patternsToTest = titlePatterns.length > 0
      ? titlePatterns
      : [newPatternInput.trim()];

    try {
      setIsTesting(true);
      setTestResult(null);
      setValidationError(null);

      const res = await scraperService.testCategory({
        baseUrl: baseUrl.trim(),
        titleSearch: patternsToTest,
      });

      setTestResult(res);

      if (res.status === 'OK') {
        toast.success(t('categories.test.successToast', { matches: res.matchedTopics, total: res.totalTopics }));
      } else if (res.status === 'SESSION_REQUIRED') {
        toast.error(t('categories.test.sessionRequiredToast'));
      } else if (res.status === 'INTERACTION_REQUIRED') {
        toast.warning(t('categories.test.interactionRequiredToast'));
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        status: 'ERROR',
        totalTopics: 0,
        matchedTopics: 0,
        sampleMatches: [],
        error: err.message,
      });
      toast.error(err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);

      if (isEditing && category) {
        const updates: UpdateCategoryDTO = {
          name: name.trim(),
          group,
          baseUrl: baseUrl.trim(),
          titleSearch: titlePatterns,
          enabled,
        };
        await scraperService.updateCategory(category.id, updates);
        toast.success(t('categories.updatedSuccessToast', { name: name.trim() }));
      } else {
        const payload: CreateCategoryDTO = {
          id: id.trim().toLowerCase(),
          name: name.trim(),
          group,
          baseUrl: baseUrl.trim(),
          titleSearch: titlePatterns,
          enabled,
        };
        await scraperService.createCategory(payload);
        toast.success(t('categories.createdSuccessToast', { name: name.trim() }));
      }

      onSaveSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes('VALIDATION_ID_DUPLICATE')) {
        setValidationError(t('categories.validation.duplicateId'));
      } else if (msg.includes('VALIDATION_ID_INVALID')) {
        setValidationError(t('categories.validation.idInvalid'));
      } else {
        setValidationError(msg);
      }
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border text-foreground max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground">
            {isEditing ? t('categories.editTitle') : t('categories.addTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {isEditing ? t('categories.editDescription') : t('categories.addDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Name & ID Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="cat-name" className="text-xs font-medium text-foreground/90">
                {t('categories.fields.name')} <span className="text-destructive">*</span>
              </label>
              <Input
                id="cat-name"
                value={name}
                onChange={handleNameChange}
                placeholder="ex: Sega Saturn, Nintendo 64"
                className="bg-background border-border text-xs h-9 text-foreground focus:border-primary"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cat-id" className="text-xs font-medium text-foreground/90">
                {t('categories.fields.id')} <span className="text-destructive">*</span>
                {isEditing && (
                  <span className="text-[10px] text-muted-foreground ml-1">({t('categories.fields.idImmutable')})</span>
                )}
              </label>
              <Input
                id="cat-id"
                value={id}
                onChange={handleIdChange}
                disabled={isEditing}
                placeholder="ex: sega-saturn, n64"
                className={cn(
                  "bg-background border-border text-xs h-9 text-foreground focus:border-primary font-mono",
                  isEditing && "opacity-60 cursor-not-allowed bg-muted/40"
                )}
                required
              />
            </div>
          </div>

          {/* Group & Enabled */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="space-y-1.5">
              <label htmlFor="cat-group" className="text-xs font-medium text-foreground/90">
                {t('categories.fields.group')}
              </label>
              <Select value={group} onValueChange={(v: ScraperCategoryGroup) => setGroup(v)}>
                <SelectTrigger id="cat-group" className="bg-background border-border text-xs h-9 text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-popover-foreground">
                  <SelectItem value="nintendo">Nintendo</SelectItem>
                  <SelectItem value="playstation">PlayStation</SelectItem>
                  <SelectItem value="xbox">Xbox</SelectItem>
                  <SelectItem value="sega">Sega</SelectItem>
                  <SelectItem value="other">{t('categories.groups.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/30">
              <div className="space-y-0.5">
                <label htmlFor="cat-enabled" className="text-xs font-medium text-foreground cursor-pointer">
                  {t('categories.fields.enabled')}
                </label>
                <p className="text-[11px] text-muted-foreground">
                  {enabled ? t('categories.fields.enabledHelp') : t('categories.fields.disabledHelp')}
                </p>
              </div>
              <Switch
                id="cat-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label={t('categories.fields.enabled')}
              />
            </div>
          </div>

          {/* Forum URL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="cat-url" className="text-xs font-medium text-foreground/90">
                {t('categories.fields.baseUrl')} <span className="text-destructive">*</span>
              </label>
              <span className="text-[10px] text-muted-foreground">
                https://rutracker.org/forum/viewforum.php?f=...
              </span>
            </div>
            <Input
              id="cat-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://rutracker.org/forum/viewforum.php?f=357"
              className="bg-background border-border text-xs h-9 text-foreground focus:border-primary font-mono"
              required
            />
          </div>

          {/* Title Search Patterns */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground/90">
                {t('categories.fields.titleSearch')} <span className="text-destructive">*</span>
              </label>
              <span className="text-[10px] text-muted-foreground">
                {t('categories.fields.titleSearchHelp')}
              </span>
            </div>

            {/* Pattern Tags */}
            <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 rounded-lg border border-border bg-muted/30">
              {titlePatterns.map((pattern, idx) => (
                <Badge
                  key={`pattern-${idx}`}
                  variant="secondary"
                  className="bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-mono py-1 px-2 flex items-center gap-1.5 border border-border"
                >
                  <span>{pattern}</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePattern(idx)}
                    aria-label={`Remover pattern ${pattern}`}
                    className="text-muted-foreground hover:text-destructive focus:outline-none"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}

              {titlePatterns.length === 0 && (
                <span className="text-xs text-muted-foreground italic p-0.5">
                  {t('categories.fields.noPatternsAdded')}
                </span>
              )}
            </div>

            {/* Add Pattern Input */}
            <div className="flex gap-2">
              <Input
                value={newPatternInput}
                onChange={(e) => setNewPatternInput(e.target.value)}
                onKeyDown={handleKeyDownPattern}
                placeholder="ex: [PS2], Playstation 2, [Saturn]"
                className="bg-background border-border text-xs h-9 text-foreground focus:border-primary flex-1 font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddPattern}
                disabled={!newPatternInput.trim()}
                className="h-9 px-3 border-border text-xs text-foreground hover:bg-secondary"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('categories.fields.addPattern')}
              </Button>
            </div>
          </div>

          {/* Test Category Button & Results Card */}
          <div className="pt-2 border-t border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t('categories.test.sectionTitle')}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestCategory}
                disabled={isTesting || !baseUrl.trim()}
                className="h-8 px-3 text-xs border-primary/30 text-primary hover:bg-primary/10"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    {t('categories.test.testing')}
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 mr-1.5 fill-primary" />
                    {t('categories.test.button')}
                  </>
                )}
              </Button>
            </div>

            {/* Test Result Display */}
            {testResult && (
              <div
                className={cn(
                  "p-3 rounded-lg border text-xs space-y-2",
                  testResult.status === 'OK' && "bg-primary/10 border-primary/30 text-foreground",
                  testResult.status === 'SESSION_REQUIRED' && "bg-amber-950/30 border-amber-500/30 text-amber-300",
                  testResult.status === 'INTERACTION_REQUIRED' && "bg-amber-950/30 border-amber-500/30 text-amber-300",
                  testResult.status === 'NO_TOPICS' && "bg-muted/40 border-border text-muted-foreground",
                  testResult.status === 'ERROR' && "bg-destructive/10 border-destructive/30 text-destructive"
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  {testResult.status === 'OK' && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  {testResult.status === 'NO_TOPICS' && <HelpCircle className="h-4 w-4 text-muted-foreground" />}
                  {(testResult.status === 'SESSION_REQUIRED' || testResult.status === 'INTERACTION_REQUIRED') && (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  )}
                  {testResult.status === 'ERROR' && <XCircle className="h-4 w-4 text-destructive" />}
                  <span>{t(`categories.test.status.${testResult.status}`)}</span>
                </div>

                {testResult.status === 'OK' && (
                  <div className="space-y-1.5 text-[11px] text-foreground/90">
                    <div className="flex justify-between">
                      <span>{t('categories.test.totalTopics')}: <strong>{testResult.totalTopics}</strong></span>
                      <span>{t('categories.test.matches')}: <strong className="text-primary">{testResult.matchedTopics}</strong></span>
                    </div>

                    {testResult.sampleMatches && testResult.sampleMatches.length > 0 && (
                      <div className="pt-1 border-t border-border space-y-1">
                        <span className="font-medium text-primary">{t('categories.test.sampleMatches')}:</span>
                        <ul className="list-disc list-inside space-y-0.5 text-muted-foreground font-mono text-[10px]">
                          {testResult.sampleMatches.map((sample, sIdx) => (
                            <li key={`sample-${sIdx}`} className="truncate">
                              {sample}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {testResult.error && (
                  <p className="text-[11px] text-rose-400">{testResult.error}</p>
                )}
              </div>
            )}
          </div>

          {/* Validation Error Message */}
          {validationError && (
            <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="border-border text-foreground hover:bg-secondary"
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || isTesting}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                isEditing ? t('categories.saveChanges') : t('categories.createCategory')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
