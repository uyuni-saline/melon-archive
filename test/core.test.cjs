'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTitle,
  buildTitleParts,
  formatFieldButtonText,
  formatJapaneseDate,
  formatUnavailableFieldButtonText,
  getSiteDefinition,
  hasBracketedContent,
  inferImageExtension,
  insertIssueDate,
  moveFavoriteActions,
  normalizeEventName,
  normalizeSpaces,
  sanitizeFilename,
  stripBracketedContent,
} = require('../melon-archive.user.js');

test('normalizeSpaces handles full-width and repeated whitespace', () => {
  assert.equal(normalizeSpaces('  サークル\u3000名\n  作者  '), 'サークル 名 作者');
});

test('stripBracketedContent removes every full-width bracket segment', () => {
  assert.equal(
    stripBracketedContent('Nosleeve Oblige【メロン限定特典付】【予約】'),
    'Nosleeve Oblige'
  );
});

test('hasBracketedContent requires a paired full-width bracket segment', () => {
  assert.equal(hasBracketedContent('标题【特典】'), true);
  assert.equal(hasBracketedContent('标题【】'), true);
  assert.equal(hasBracketedContent('标题【特典'), false);
  assert.equal(hasBracketedContent('普通标题'), false);
});

test('formatJapaneseDate normalizes supported dates and rejects invalid values', () => {
  assert.equal(formatJapaneseDate('2026/8/6'), '2026年08月06日');
  assert.equal(formatJapaneseDate('2026年08月16日'), '2026年08月16日');
  assert.equal(formatJapaneseDate('2026-02-29'), '');
  assert.equal(formatJapaneseDate('未定'), '');
});

test('sanitizeFilename replaces unsafe characters and protects reserved names', () => {
  assert.equal(sanitizeFilename('A/B: C?'), 'A／B： C？');
  assert.equal(sanitizeFilename('CON'), '_CON');
  assert.equal(sanitizeFilename('...'), 'cover');
});

test('sanitizeFilename truncates by Unicode code point', () => {
  assert.equal(sanitizeFilename('本📕タイトル', 3), '本📕タ');
});

test('normalizeEventName shortens known events and removes dates', () => {
  assert.equal(normalizeEventName('コミックマーケット 106 2026/08/16'), 'C106');
  assert.equal(normalizeEventName('博麗神社 例大祭(第23回)'), '例大祭23');
  assert.equal(normalizeEventName('こみっくトレジャー 48'), 'こみトレ48');
});

test('buildTitle produces the archive title format', () => {
  assert.equal(
    buildTitle({
      rawTitle: '新刊タイトル',
      info: {
        サークル名: 'テスト会 (作品数:12)',
        作家名: '作者A',
        イベント: 'コミックマーケット106 2026/08/16',
        ジャンル: 'オリジナル',
      },
    }),
    '(C106) [テスト会 (作者A)] 新刊タイトル (オリジナル)'
  );
});

test('buildTitle includes full-width bracket content by default and can hide it', () => {
  const product = {
    rawTitle: 'Nosleeve Oblige【メロン限定特典付】',
    info: {
      サークル名: 'Lunaberry (作品数:36)',
      作家名: 'nana',
      ジャンル: 'オリジナル',
      イベント: 'コミックマーケット108',
    },
  };

  assert.equal(
    buildTitle(product),
    '(C108) [Lunaberry (nana)] Nosleeve Oblige【メロン限定特典付】 (オリジナル)'
  );
  assert.equal(
    buildTitle(product, { includeBracketedContent: false }),
    '(C108) [Lunaberry (nana)] Nosleeve Oblige (オリジナル)'
  );
});

test('buildTitleParts returns normalized independently copyable fields', () => {
  assert.deepEqual(
    buildTitleParts({
      rawTitle: 'Nosleeve Oblige【メロン限定特典付】',
      info: {
        サークル名: 'Lunaberry (作品数:36)',
        作家名: 'nana',
        ジャンル: 'オリジナル',
        イベント: 'コミックマーケット108',
      },
    }),
    {
      event: 'C108',
      circle: 'Lunaberry',
      author: 'nana',
      title: 'Nosleeve Oblige【メロン限定特典付】',
      genre: 'オリジナル',
    }
  );
});

test('formatFieldButtonText keeps the complete normalized value', () => {
  assert.equal(formatFieldButtonText(' 标题 ', ' 很长的\u3000标题 '), '标题：很长的 标题');
});

test('formatUnavailableFieldButtonText identifies the missing field', () => {
  assert.equal(formatUnavailableFieldButtonText(' 作者 '), '无作者信息');
  assert.equal(formatUnavailableFieldButtonText('展会'), '无展会信息');
});

test('buildTitle preserves the intentional blank author placeholder', () => {
  assert.equal(
    buildTitle({ rawTitle: 'タイトル', info: { サークル: 'サークルのみ' } }),
    '[サークルのみ ()] タイトル'
  );
});

test('buildTitle supports author-only products', () => {
  assert.equal(
    buildTitle({ rawTitle: 'タイトル', info: { 作者: '作者のみ' } }),
    '[作者のみ] タイトル'
  );
});

test('getSiteDefinition accepts supported product URLs only', () => {
  const site = getSiteDefinition(
    'https://www.melonbooks.co.jp/products/detail.php?product_id=123'
  );
  assert.equal(site?.titleSelector, '.page-header');
  assert.equal(site?.releaseDateSelector, '.item-metas-wrap .product-info__release-date');
  assert.equal(site?.fieldPanelSelector, '.item-metas-wrap .item-meta3');
  assert.equal(site?.favoriteGroupSelector, '.item-metas-wrap .item-favorite');
  assert.equal(site?.deliveryTitleSelector, '.item-metas-wrap .delivery-accordion__title');
  assert.equal(getSiteDefinition('https://example.com/detail/detail.php?product_id=123'), null);
  assert.equal(getSiteDefinition('https://www.melonbooks.co.jp/products/detail.php'), null);
  assert.equal(getSiteDefinition('https://www.melonbooks.co.jp/'), null);
  assert.equal(getSiteDefinition('not a URL'), null);
});

test('insertIssueDate places the normalized issue date above the release date', (t) => {
  const originalDocument = global.document;
  t.after(() => {
    if (originalDocument === undefined) delete global.document;
    else global.document = originalDocument;
  });

  let insertedNode = null;
  const releaseDateElement = {
    className: 'product-info__release-date',
    before(node) {
      insertedNode = node;
    },
  };
  global.document = {
    getElementById: () => null,
    querySelector: () => releaseDateElement,
    createElement: () => ({}),
  };

  const site = getSiteDefinition(
    'https://www.melonbooks.co.jp/products/detail.php?product_id=123'
  );
  assert.equal(insertIssueDate(site, { 発行日: '2026/08/16' }), true);
  assert.deepEqual(insertedNode, {
    id: 'melon-archive-issue-date',
    className: 'product-info__release-date',
    textContent: '発行日：2026年08月16日',
  });
});

test('moveFavoriteActions preserves and moves the original action group', (t) => {
  const originalDocument = global.document;
  t.after(() => {
    if (originalDocument === undefined) delete global.document;
    else global.document = originalDocument;
  });

  const favoriteGroup = {};
  let movedNode = null;
  const deliveryGroup = {
    before(node) {
      movedNode = node;
    },
  };
  const favoriteButtons = [
    {
      textContent: 'お気に入り\nサークルに追加',
      closest: () => favoriteGroup,
    },
    {
      textContent: 'ほしいもの\nリストに追加',
      closest: () => favoriteGroup,
    },
  ];
  const deliveryTitle = {
    textContent: '配送方法',
    closest: () => deliveryGroup,
  };

  const site = getSiteDefinition(
    'https://www.melonbooks.co.jp/detail/detail.php?product_id=123'
  );
  global.document = {
    querySelectorAll(selector) {
      if (selector === site.favoriteActionSelector) return favoriteButtons;
      if (selector === site.deliveryTitleSelector) return [deliveryTitle];
      return [];
    },
  };

  assert.equal(moveFavoriteActions(site), true);
  assert.equal(movedNode, favoriteGroup);
});

test('inferImageExtension prioritizes MIME type and falls back to URL', () => {
  assert.equal(inferImageExtension('image/webp', 'https://example.com/cover.jpg'), 'webp');
  assert.equal(inferImageExtension('', 'https://example.com/cover.png?size=large'), 'png');
  assert.equal(inferImageExtension('', 'https://example.com/image'), 'jpg');
});
