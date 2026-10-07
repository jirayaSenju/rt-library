import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  normalizeReleaseYear as normalizeReleaseYearTS,
  normalizeDeveloper as normalizeDeveloperTS,
  normalizePublisher as normalizePublisherTS,
  normalizeGenre as normalizeGenreTS,
  normalizeVersion as normalizeVersionTS,
  normalizeLanguages as normalizeLanguagesTS,
  normalizeAudio as normalizeAudioTS,
  normalizeImageFormat as normalizeImageFormatTS,
  normalizeMultiplayer as normalizeMultiplayerTS,
  normalizeRegion as normalizeRegionTS,
  normalizeItemMetadata as normalizeItemMetadataTS,
} from '../../src/utils/metadataNormalizer';

const {
  normalizeReleaseYear: normalizeReleaseYearCJS,
  normalizeDeveloper: normalizeDeveloperCJS,
  normalizePublisher: normalizePublisherCJS,
  normalizeGenre: normalizeGenreCJS,
  normalizeVersion: normalizeVersionCJS,
  normalizeLanguages: normalizeLanguagesCJS,
  normalizeAudio: normalizeAudioCJS,
  normalizeImageFormat: normalizeImageFormatCJS,
  normalizeMultiplayer: normalizeMultiplayerCJS,
  normalizeRegion: normalizeRegionCJS,
  normalizeItemMetadata: normalizeItemMetadataCJS,
} = require('../../electron/scraper/metadataNormalizer.cjs');

describe('V3-06 Metadata Normalization Unit & Parity Tests', () => {
  const parseHTML = (html: string) => {
    const dom = new JSDOM(html);
    return dom.window.document;
  };

  describe('FASE 44 - Release Year Normalization', () => {
    it('normalizes various year string formats and integers', () => {
      expect(normalizeReleaseYearTS('2026, сентябрь')).toBe(2026);
      expect(normalizeReleaseYearTS('2006')).toBe(2006);
      expect(normalizeReleaseYearTS('2020-2021')).toBe(2020);
      expect(normalizeReleaseYearTS('2024 г.')).toBe(2024);
      expect(normalizeReleaseYearTS(2023)).toBe(2023);
      expect(normalizeReleaseYearTS('unknown')).toBeNull();
      expect(normalizeReleaseYearTS(null)).toBeNull();
      expect(normalizeReleaseYearTS('')).toBeNull();
      expect(normalizeReleaseYearTS('1850')).toBeNull(); // below 1970
      expect(normalizeReleaseYearTS('2099')).toBeNull(); // above reasonable ceiling
    });

    it('maintains exact parity between TS and CJS', () => {
      const cases = ['2026, сентябрь', '2006', '2020-2021', '2024 г.', 2018, 'unknown', null];
      for (const c of cases) {
        expect(normalizeReleaseYearTS(c)).toBe(normalizeReleaseYearCJS(c));
      }
    });
  });

  describe('FASE 7 & 8 - Developer and Publisher Normalization', () => {
    it('normalizes single and multiple developer strings', () => {
      const devTS = normalizeDeveloperTS('Ritual Entertainment, 2015 Games, Nightdive Studios');
      const devCJS = normalizeDeveloperCJS('Ritual Entertainment, 2015 Games, Nightdive Studios');

      expect(devTS.raw).toBe('Ritual Entertainment, 2015 Games, Nightdive Studios');
      expect(devTS.developer).toBe('Ritual Entertainment, 2015 Games, Nightdive Studios');
      expect(devTS.developers).toEqual(['Ritual Entertainment', '2015 Games', 'Nightdive Studios']);
      expect(devTS).toEqual(devCJS);

      const single = normalizeDeveloperTS('Nintendo EPD');
      expect(single.developer).toBe('Nintendo EPD');
      expect(single.developers).toEqual(['Nintendo EPD']);

      expect(normalizeDeveloperTS(null).developer).toBeNull();
    });

    it('normalizes publisher names without altering proper nouns', () => {
      const pubTS = normalizePublisherTS('Atari, Nightdive Studios');
      const pubCJS = normalizePublisherCJS('Atari, Nightdive Studios');

      expect(pubTS.raw).toBe('Atari, Nightdive Studios');
      expect(pubTS.publisher).toBe('Atari, Nightdive Studios');
      expect(pubTS.publishers).toEqual(['Atari', 'Nightdive Studios']);
      expect(pubTS).toEqual(pubCJS);
    });
  });

  describe('FASE 9 - Genre Normalization', () => {
    it('normalizes genres and deduplicates list case-insensitively', () => {
      const genreTS = normalizeGenreTS('First Person Shooter, Action, Shooter, action');
      const genreCJS = normalizeGenreCJS('First Person Shooter, Action, Shooter, action');

      expect(genreTS.raw).toBe('First Person Shooter, Action, Shooter, action');
      expect(genreTS.genres).toEqual(['First Person Shooter', 'Action', 'Shooter']);
      expect(genreTS.genre).toBe('First Person Shooter, Action, Shooter');
      expect(genreTS).toEqual(genreCJS);
    });
  });

  describe('FASE 10 - Version Normalization', () => {
    it('normalizes version tokens preserving raw', () => {
      expect(normalizeVersionTS('1.0.1')).toEqual({ raw: '1.0.1', version: '1.0.1' });
      expect(normalizeVersionTS('v1.0')).toEqual({ raw: 'v1.0', version: '1.0' });
      expect(normalizeVersionTS('ver. 1.31')).toEqual({ raw: 'ver. 1.31', version: '1.31' });
      expect(normalizeVersionTS('Update 1.0.4')).toEqual({ raw: 'Update 1.0.4', version: 'Update 1.0.4' });
      expect(normalizeVersionTS(null)).toEqual({ raw: null, version: null });

      expect(normalizeVersionCJS('v1.0.1')).toEqual(normalizeVersionTS('v1.0.1'));
    });
  });

  describe('FASE 41 - Language & Audio Normalization', () => {
    it('extracts language codes correctly without guessing unknowns', () => {
      const single = normalizeLanguagesTS('Английский [ENG]');
      expect(single.codes).toEqual(['en']);

      const multi = normalizeLanguagesTS('Русский [RUS], Английский [ENG]');
      expect(multi.codes).toContain('ru');
      expect(multi.codes).toContain('en');

      const english = normalizeLanguagesTS('English');
      expect(english.codes).toEqual(['en']);

      const unknownMulti = normalizeLanguagesTS('MULTI5');
      expect(unknownMulti.raw).toBe('MULTI5');
      expect(unknownMulti.codes).toEqual([]);
      expect(unknownMulti.unknown).toEqual(['MULTI5']);

      expect(normalizeLanguagesCJS('Русский [RUS]')).toEqual(normalizeLanguagesTS('Русский [RUS]'));
    });

    it('normalizes audio language', () => {
      const audio = normalizeAudioTS('Английский');
      expect(audio.codes).toEqual(['en']);
      expect(normalizeAudioCJS('Английский')).toEqual(audio);
    });
  });

  describe('FASE 42 - Multiplayer Normalization', () => {
    it('normalizes multiplayer variants to boolean or null', () => {
      expect(normalizeMultiplayerTS('нет').multiplayer).toBe(false);
      expect(normalizeMultiplayerTS('Нет').multiplayer).toBe(false);
      expect(normalizeMultiplayerTS('отсутствует').multiplayer).toBe(false);
      expect(normalizeMultiplayerTS('Да').multiplayer).toBe(true);
      expect(normalizeMultiplayerTS('2 игрока').multiplayer).toBe(true);
      expect(normalizeMultiplayerTS('Online').multiplayer).toBe(true);
      expect(normalizeMultiplayerTS('1-4 players').multiplayer).toBe(true);
      expect(normalizeMultiplayerTS('Unknown').multiplayer).toBeNull();
      expect(normalizeMultiplayerTS(null).multiplayer).toBeNull();

      expect(normalizeMultiplayerCJS('нет')).toEqual(normalizeMultiplayerTS('нет'));
      expect(normalizeMultiplayerCJS('2 игрока')).toEqual(normalizeMultiplayerTS('2 игрока'));
    });
  });

  describe('FASE 43 - Image Format Normalization', () => {
    it('normalizes formats to uppercase without leading dot', () => {
      expect(normalizeImageFormatTS('.NSZ')).toBe('NSZ');
      expect(normalizeImageFormatTS('nsp')).toBe('NSP');
      expect(normalizeImageFormatTS('ISO')).toBe('ISO');
      expect(normalizeImageFormatTS('')).toBeNull();
      expect(normalizeImageFormatTS(null)).toBeNull();
      expect(normalizeImageFormatTS('.xci, .nsp')).toBe('XCI, NSP');

      expect(normalizeImageFormatCJS('.NSZ')).toBe(normalizeImageFormatTS('.NSZ'));
    });
  });

  describe('FASE 16 - Region Normalization', () => {
    it('normalizes explicit regions without guessing from languages', () => {
      expect(normalizeRegionTS('EUR').region).toBe('EUR');
      expect(normalizeRegionTS('USA / NTSC-U').region).toBe('USA');
      expect(normalizeRegionTS('Region Free').region).toBe('WORLD');
      expect(normalizeRegionTS('', '[Nintendo Switch] Game [EUR]').region).toBe('EUR');

      expect(normalizeRegionCJS('EUR')).toEqual(normalizeRegionTS('EUR'));
    });
  });

  describe('FASE 40 - Real Fixture SiN: Reloaded', () => {
    it('normalizes all fields for SiN: Reloaded correctly', () => {
      const rawSin = {
        title: '[Nintendo Switch] Sin Reloaded Gold + Wages of Sin [NSZ][ENG]',
        topicTitle: '[Nintendo Switch] Sin Reloaded Gold + Wages of Sin [NSZ][ENG]',
        canonicalTitle: 'SiN: Reloaded',
        releaseYear: '2026',
        genre: 'First Person Shooter, Action',
        developer: 'Ritual Entertainment, 2015 Games, Nightdive Studios',
        publisher: 'Atari',
        imageFormat: '.NSZ',
        version: '1.0.1',
        interfaceLanguage: 'Английский [ENG]',
        voiceLanguage: 'Английский',
        multiplayer: 'нет',
        region: 'EUR',
      };

      const norm = normalizeItemMetadataTS(rawSin);

      expect(norm.releaseYear).toBe(2026);
      expect(norm.genre).toBe('First Person Shooter, Action');
      expect(norm.genres).toEqual(['First Person Shooter', 'Action']);
      expect(norm.developer).toBe('Ritual Entertainment, 2015 Games, Nightdive Studios');
      expect(norm.developers).toEqual(['Ritual Entertainment', '2015 Games', 'Nightdive Studios']);
      expect(norm.publisher).toBe('Atari');
      expect(norm.imageFormat).toBe('NSZ');
      expect(norm.version).toBe('1.0.1');
      expect(norm.languageCodes).toEqual(['en']);
      expect(norm.audioLanguageCodes).toEqual(['en']);
      expect(norm.multiplayerBoolean).toBe(false);
      expect(norm.region).toBe('EUR');

      expect(normalizeItemMetadataCJS(rawSin)).toEqual(norm);
    });
  });

  describe('FASE 45 - Mocked Legacy Migration and Idempotency', () => {
    it('enriches legacy records and is strictly idempotent', () => {
      const recordedMigrations = new Set<string>();
      const store = new Map<string, any>();

      // Populate legacy item
      store.set('item_sin', {
        id: 'item_sin',
        title: '[Nintendo Switch] Sin Reloaded Gold [NSZ][ENG]',
        topicTitle: '[Nintendo Switch] Sin Reloaded Gold [NSZ][ENG]',
        canonicalTitle: 'SiN: Reloaded',
        genre: 'First Person Shooter, Action',
        developer: 'Ritual Entertainment, Nightdive Studios',
        publisher: 'Atari',
        releaseYear: '2026',
        imageFormat: '.nsz',
        version: 'v1.0.1',
        multiplayer: 'нет',
        interfaceLanguage: 'Английский [ENG]',
        voiceLanguage: 'Английский',
      });

      const runMigration = () => {
        if (recordedMigrations.has('metadata_normalization_v1')) return 0;

        let count = 0;
        for (const [id, item] of store.entries()) {
          const norm = normalizeItemMetadataTS(item);
          store.set(id, {
            ...item,
            genre: norm.genre,
            developer: norm.developer,
            publisher: norm.publisher,
            releaseYear: norm.releaseYear,
            version: norm.version,
            imageFormat: norm.imageFormat,
            multiplayer: norm.multiplayer,
          });
          count++;
        }
        recordedMigrations.add('metadata_normalization_v1');
        return count;
      };

      // Run 1: Should process 1 item
      const processed1 = runMigration();
      expect(processed1).toBe(1);

      const enriched = store.get('item_sin');
      expect(enriched.releaseYear).toBe(2026);
      expect(enriched.imageFormat).toBe('NSZ');
      expect(enriched.version).toBe('1.0.1');
      expect(enriched.multiplayer).toBe('No');

      // Run 2: Should be no-op (idempotent)
      const processed2 = runMigration();
      expect(processed2).toBe(0);
      expect(store.get('item_sin')).toEqual(enriched);
    });
  });
});
