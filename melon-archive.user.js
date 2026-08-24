// ==UserScript==
// @name         Melon Archive
// @namespace    https://github.com/uyuni-saline
// @version      2.1.0
// @description  在Melonbooks同人商品页生成规范标题、归档图片并管理私人购买记录。
// @author       Saline
// @homepageURL  https://github.com/uyuni-saline/melon-archive
// @supportURL   https://github.com/uyuni-saline/melon-archive/issues
// @updateURL    https://raw.githubusercontent.com/uyuni-saline/melon-archive/main/melon-archive.user.js
// @downloadURL  https://raw.githubusercontent.com/uyuni-saline/melon-archive/main/melon-archive.user.js
// @match        https://www.melonbooks.co.jp/detail/detail.php*
// @match        https://www.melonbooks.co.jp/products/detail.php*
// @connect      *
// @grant        GM_addStyle
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_LABEL = 'Melon Archive';
  const UI_ID = 'melon-archive-actions';
  const FIELD_PANEL_ID = 'melon-archive-fields';
  const ISSUE_DATE_ID = 'melon-archive-issue-date';
  const SETTINGS_MODAL_ID = 'melon-archive-settings-host';
  const PURCHASE_MODAL_ID = 'melon-archive-purchase-host';
  const SETTINGS_STORAGE_KEY = 'settings';
  const SETTINGS_SCHEMA_VERSION = 3;
  const ARCHIVE_SCHEMA_VERSION = 1;
  const DATABASE_NAME = 'melon-archive';
  const DATABASE_VERSION = 1;
  const DIRECTORY_HANDLE_KEY = 'archive-directory';
  const NOW_PRINTING_PATTERN = /(?:now[_-]?printing|image=(?:&|$))/iu;
  const AUTHOR_PLACEHOLDER = true;
  const ELEMENT_WAIT_TIMEOUT_MS = 12_000;
  const DOWNLOAD_TIMEOUT_MS = 30_000;

  const DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    includeBracketedContent: true,
    enablePriceCopy: true,
    showIssueDate: true,
    moveFavoriteActions: true,
    showFieldButtons: true,
    includeEvent: true,
    includeCircle: true,
    includeAuthor: true,
    includeGenre: true,
    enablePurchaseRecords: true,
    copyTitleOnDownload: false,
    imageBackend: 'browser',
    imageScope: 'thumbnail',
  });

  const SETTINGS_BOOLEAN_KEYS = Object.freeze([
    'includeBracketedContent',
    'enablePriceCopy',
    'showIssueDate',
    'moveFavoriteActions',
    'showFieldButtons',
    'includeEvent',
    'includeCircle',
    'includeAuthor',
    'includeGenre',
    'enablePurchaseRecords',
    'copyTitleOnDownload',
  ]);

  const SETTINGS_ENUMS = Object.freeze({
    imageBackend: Object.freeze(['browser', 'directory']),
    imageScope: Object.freeze(['thumbnail', 'cover', 'all']),
  });

  const SITE_DEFINITION = Object.freeze({
    hostnames: ['www.melonbooks.co.jp'],
    paths: ['/detail/detail.php', '/products/detail.php'],
    anchorSelector: '.page-header',
    titleSelector: '.page-header',
    rowSelector: '.item-detail .table-wrapper tr',
    releaseDateSelector: '.item-metas-wrap .product-info__release-date',
    priceSelector: '.item-metas-wrap .item-meta3 .price--value',
    fieldPanelSelector: '.item-metas-wrap .item-meta3',
    favoriteActionSelector: '.item-metas-wrap .fav-button',
    favoriteGroupSelector: '.item-metas-wrap .item-favorite',
    deliveryTitleSelector: '.item-metas-wrap .delivery-accordion__title',
    deliveryGroupSelector: '.item-metas-wrap .accordion-group',
    copyButtonColor: '#56C0CA',
    downloadButtonColor: '#F6BD57',
    purchaseButtonColor: '#77B785',
    actionTextColor: '#1f1f1f',
    fieldButtonColor: '#EDEADA',
    fieldButtonTextColor: '#00A667',
    unavailableFieldButtonColor: '#F4F3EF',
    unavailableFieldButtonTextColor: '#8A8A8A',
    coverSelectors: ['.main_image img', '.item-main img'],
    gallerySelectors: ['.slider.my-gallery img', '.main_image img', '.item-main img'],
    bonusImageSelectors: ['.item-detail.item-priv img'],
  });

  const FIELD_COPY_BUTTONS = Object.freeze([
    { key: 'event', label: '展会' },
    { key: 'circle', label: '社团' },
    { key: 'author', label: '作者' },
    { key: 'title', label: '标题' },
    { key: 'genre', label: '分类' },
  ]);

  const FAVORITE_ACTION_TEXTS = Object.freeze([
    'お気に入りサークルに追加',
    'ほしいものリストに追加',
  ]);

  const INVALID_FILENAME_CHARS = Object.freeze({
    ':': '：',
    '?': '？',
    '*': '＊',
    '"': '＂',
    '<': '＜',
    '>': '＞',
    '|': '｜',
    '/': '／',
    '\\': '＼',
  });

  const MIME_EXTENSIONS = Object.freeze({
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  });

  const STYLES = `
#${UI_ID} {
  --melon-archive-copy-color: #56C0CA;
  --melon-archive-download-color: #F6BD57;
  --melon-archive-purchase-color: #77B785;
  --melon-archive-action-text: #1f1f1f;
  display: block;
  margin: 4px 0 8px;
}

#${UI_ID} .melon-archive-option {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 35px;
  box-sizing: border-box;
  margin: 0;
  border: 1px solid #d8d8d8;
  border-radius: 3px;
  padding: 0 12px;
  color: #444;
  background: #f7f7f7;
  font: 600 12px/1.35 "Microsoft YaHei", "Yu Gothic", Helvetica, Arial, sans-serif;
  cursor: pointer;
  user-select: none;
}

#${UI_ID} .melon-archive-option input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--melon-archive-copy-color);
}

#${UI_ID} .melon-archive-buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.melon-archive-button {
  appearance: none;
  width: auto;
  max-width: 100%;
  box-sizing: border-box;
  border: 0;
  border-radius: 3px;
  padding: 9px 14px;
  font: 600 12px/1.35 "Microsoft YaHei", "Yu Gothic", Helvetica, Arial, sans-serif;
  text-align: center;
  cursor: pointer;
}

.melon-archive-button--copy {
  color: var(--melon-archive-action-text);
  background: var(--melon-archive-copy-color);
}

.melon-archive-button--download {
  color: var(--melon-archive-action-text);
  background: var(--melon-archive-download-color);
}

.melon-archive-button--purchase {
  color: var(--melon-archive-action-text);
  background: var(--melon-archive-purchase-color);
}

.melon-archive-button--purchase-edit {
  width: 35px;
  height: 35px;
  padding: 0;
  border: 1px solid #cfcfcf;
  color: #444;
  background: #f7f7f7;
  font-size: 16px;
}

.melon-archive-button--purchase-edit[hidden] {
  display: none;
}

.melon-archive-button:hover {
  filter: brightness(.94);
}

.melon-archive-button:focus-visible,
#${UI_ID} .melon-archive-option:has(input:focus-visible) {
  outline: 2px solid #1967d2;
  outline-offset: 2px;
}

.melon-archive-button:disabled,
.melon-archive-button.is-busy {
  opacity: .62;
  cursor: wait;
}

.melon-archive-button.is-done {
  filter: saturate(.78);
}

.melon-archive-price-copy {
  border-radius: 2px;
  cursor: copy;
  transition: background-color .15s ease, opacity .15s ease;
}

.melon-archive-price-copy:hover {
  background: rgba(86, 192, 202, .16);
}

.melon-archive-price-copy:active {
  opacity: .65;
}

.melon-archive-price-copy:focus-visible {
  outline: 2px solid #1967d2;
  outline-offset: 2px;
}

.melon-archive-has-fields {
  display: flow-root;
}

#${FIELD_PANEL_ID} {
  --melon-archive-field-color: #EDEADA;
  --melon-archive-field-text: #00A667;
  --melon-archive-field-unavailable-color: #F4F3EF;
  --melon-archive-field-unavailable-text: #8A8A8A;
  float: right;
  clear: right;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 240px;
  margin: 0 0 16px 20px;
}

#${FIELD_PANEL_ID} .melon-archive-button--field {
  display: block;
  width: 240px;
  height: 34px;
  max-width: 100%;
  border: 1px solid #bebbae;
  border-radius: 0;
  padding: 0 10px;
  color: var(--melon-archive-field-text);
  background: var(--melon-archive-field-color);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#${FIELD_PANEL_ID} .melon-archive-button--field.is-unavailable,
#${FIELD_PANEL_ID} .melon-archive-button--field.is-unavailable:disabled {
  border-color: #d8d5ca;
  color: var(--melon-archive-field-unavailable-text);
  background: var(--melon-archive-field-unavailable-color);
  opacity: 1;
  cursor: not-allowed;
  filter: none;
}

#${FIELD_PANEL_ID}.melon-archive-fields--fallback {
  float: none;
  clear: both;
  margin: 8px 0 0;
}

@media screen and (max-width: 979px) {
  #${FIELD_PANEL_ID} {
    float: none;
    clear: both;
    margin: 0 0 16px;
  }
}
`;

  const SETTINGS_STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
}

* {
  box-sizing: border-box;
}

.backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  color: #222;
  background: rgba(0, 0, 0, .48);
  font: 14px/1.55 "Microsoft YaHei", "Yu Gothic", Helvetica, Arial, sans-serif;
}

.dialog {
  width: min(520px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  border: 1px solid #d8d8d8;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(0, 0, 0, .28);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #e6e6e6;
  padding: 16px 18px;
}

.header h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
}

.close {
  appearance: none;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 4px;
  color: #555;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
}

.close:hover {
  background: #f1f1f1;
}

.body {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.field {
  display: grid;
  gap: 5px;
}

.field > span {
  font-weight: 600;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  min-height: 36px;
  border: 1px solid #cfcfcf;
  border-radius: 4px;
  padding: 7px 9px;
  color: #222;
  background: #fff;
  font: inherit;
}

.field textarea {
  min-height: 76px;
  resize: vertical;
}

.summary {
  margin: 0;
  border-radius: 5px;
  padding: 10px 12px;
  background: #f5f5f5;
  overflow-wrap: anywhere;
}

.record-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.record-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px auto;
  align-items: end;
  gap: 10px;
  border: 1px solid #e1e1e1;
  border-radius: 4px;
  padding: 8px 10px;
}

.record-row .field {
  min-width: 0;
}

.record-row .field > span {
  font-size: 12px;
}

.record-row .default-date {
  grid-column: 1 / -1;
  margin: -4px 0 0;
  color: #54805d;
  font-size: 11px;
}

@media screen and (max-width: 520px) {
  .record-row {
    grid-template-columns: minmax(0, 1fr) 80px;
  }

  .record-row button {
    grid-column: 1 / -1;
  }
}

.record-row button,
.inline-actions button {
  appearance: none;
  border: 1px solid #cfcfcf;
  border-radius: 4px;
  padding: 5px 9px;
  color: #333;
  background: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.status {
  margin: 0;
  color: #555;
  font-size: 12px;
}

.danger {
  color: #a12622 !important;
}

fieldset {
  display: grid;
  gap: 10px;
  min-width: 0;
  margin: 0;
  border: 1px solid #dedede;
  border-radius: 6px;
  padding: 12px 14px 14px;
}

legend {
  padding: 0 6px;
  font-weight: 700;
}

.option {
  display: flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
  user-select: none;
}

.option input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #56C0CA;
}

.hint {
  margin: 0;
  color: #666;
  font-size: 12px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid #e6e6e6;
  padding: 14px 18px;
}

.actions button {
  appearance: none;
  min-height: 36px;
  border: 1px solid #cfcfcf;
  border-radius: 4px;
  padding: 7px 14px;
  color: #222;
  background: #f6f6f6;
  font: 600 13px/1.4 "Microsoft YaHei", "Yu Gothic", Helvetica, Arial, sans-serif;
  cursor: pointer;
}

.actions button:hover,
.actions button:focus-visible,
.close:focus-visible,
.option:has(input:focus-visible) {
  outline: 2px solid #1967d2;
  outline-offset: 2px;
}

.actions .save {
  border-color: #46aeb8;
  background: #56C0CA;
}
`;

  /**
   * 将全角空格与连续空白规范化为单个半角空格。
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeSpaces(value) {
    return String(value ?? '')
      .replace(/\u3000/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
  }

  /**
   * 只接受已知布尔设置，并为缺失或无效值补充默认值。
   * @param {unknown} value
   * @returns {typeof DEFAULT_SETTINGS}
   */
  function normalizeSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const settings = { schemaVersion: SETTINGS_SCHEMA_VERSION };

    for (const key of SETTINGS_BOOLEAN_KEYS) {
      settings[key] = typeof source[key] === 'boolean' ? source[key] : DEFAULT_SETTINGS[key];
    }

    for (const [key, allowedValues] of Object.entries(SETTINGS_ENUMS)) {
      settings[key] = allowedValues.includes(source[key]) ? source[key] : DEFAULT_SETTINGS[key];
    }

    return settings;
  }

  /**
   * @returns {typeof DEFAULT_SETTINGS}
   */
  function loadSettings() {
    return normalizeSettings(GM_getValue(SETTINGS_STORAGE_KEY, {}));
  }

  /**
   * 默认配置不占用持久化空间；其他配置按统一结构保存。
   * @param {unknown} value
   * @returns {typeof DEFAULT_SETTINGS}
   */
  function saveSettings(value) {
    const settings = normalizeSettings(value);
    const usesDefaults =
      SETTINGS_BOOLEAN_KEYS.every((key) => settings[key] === DEFAULT_SETTINGS[key]) &&
      Object.keys(SETTINGS_ENUMS).every((key) => settings[key] === DEFAULT_SETTINGS[key]);

    if (usesDefaults) GM_deleteValue(SETTINGS_STORAGE_KEY);
    else GM_setValue(SETTINGS_STORAGE_KEY, settings);
    return settings;
  }

  /**
   * 删除商品主标题中的全角【】片段及其内容。
   * @param {unknown} value
   * @returns {string}
   */
  function stripBracketedContent(value) {
    return normalizeSpaces(normalizeSpaces(value).replace(/【[^】]*】/gu, ' '));
  }

  /**
   * 判断原始商品标题中是否含有成对的全角【】片段。
   * @param {unknown} value
   * @returns {boolean}
   */
  function hasBracketedContent(value) {
    return /【[^】]*】/u.test(String(value ?? ''));
  }

  /**
   * 将页面详情中的日期统一为Melonbooks正在使用的日文显示格式。
   * @param {unknown} value
   * @returns {string}
   */
  function formatJapaneseDate(value) {
    const normalized = normalizeSpaces(value);
    const match = normalized.match(
      /^(\d{4})\s*(?:年|[./-])\s*(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})\s*日?$/u
    );
    if (!match) return '';

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    const isValidDate =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
    if (!isValidDate) return '';

    return `${year}年${String(month).padStart(2, '0')}月${String(day).padStart(2, '0')}日`;
  }

  /**
   * 从价格文本中提取可直接用于记录或计算的纯数字金额。
   * @param {unknown} value
   * @returns {string}
   */
  function extractNumericPrice(value) {
    return String(value ?? '').replace(/[^\d]/gu, '');
  }

  /**
   * 保序去重并删除空值。
   * @param {string[]} values
   * @returns {string[]}
   */
  function uniqueNonEmpty(values) {
    return [...new Set(values.map(normalizeSpaces).filter(Boolean))];
  }

  /**
   * 购买日期固定使用日精度；空值表示日期未知。
   * @param {unknown} value
   * @returns {{value: string, precision: 'day'}|null}
   */
  function normalizePurchaseDate(value) {
    const normalized = normalizeSpaces(value).replace(/[./]/gu, '-');
    if (!normalized) return null;

    const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1900 || year > 2200) return null;
    if (month < 1 || month > 12) return null;
    const monthValue = `${year}-${String(month).padStart(2, '0')}`;

    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return { value: `${monthValue}-${String(day).padStart(2, '0')}`, precision: 'day' };
  }

  /**
   * 建立一条购买批次。自动日期仅用于首次从页面発行日快速入库。
   * @param {object} options
   * @param {unknown} [options.purchaseDate]
   * @param {number} [options.quantity]
   * @param {boolean} [options.purchaseDateIsDefault]
   * @param {string} [options.id]
   * @param {string} [options.recordedAt]
   */
  function createAcquisition({
    purchaseDate = '',
    quantity = 1,
    purchaseDateIsDefault = false,
    id = createRecordId(),
    recordedAt = new Date().toISOString(),
  } = {}) {
    const normalizedQuantity = Number(quantity);
    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 1 || normalizedQuantity > 999) {
      throw new Error('购买数量必须是1至999之间的整数。');
    }
    const dateInput = normalizeSpaces(purchaseDate);
    const purchasedOn = normalizePurchaseDate(dateInput);
    if (dateInput && !purchasedOn) throw new Error('购买日期请使用YYYY-MM-DD格式。');
    return {
      id,
      quantity: normalizedQuantity,
      purchasedOn,
      purchaseDateIsDefault: Boolean(purchasedOn && purchaseDateIsDefault),
      recordedAt,
    };
  }

  /**
   * 将标题上方标签分为分类和销售状态，同时保留原始顺序。
   * @param {string[]} labels
   */
  function classifyHeaderLabels(labels) {
    const headerLabels = uniqueNonEmpty(labels);
    const productCategory = headerLabels[0] ?? null;
    const marketCategory = headerLabels.find((label) => label === '同人') ?? null;
    const ageLabel =
      headerLabels.find((label) => /^(?:一般|成人|R18|全年齢)$/iu.test(label)) ?? null;
    const classificationValues = new Set(
      [productCategory, marketCategory, ageLabel].filter(Boolean)
    );
    return {
      headerLabels,
      productCategory,
      marketCategory,
      ageLabel,
      salesBadges: headerLabels.filter((label) => !classificationValues.has(label)),
    };
  }

  /**
   * 导入时保留更新较新的商品快照，并按ID合并购买批次。
   * @param {Record<string, any>|null} localRecord
   * @param {Record<string, any>} incomingRecord
   * @returns {Record<string, any>}
   */
  function mergeProductRecords(localRecord, incomingRecord) {
    if (!localRecord) return structuredClone(incomingRecord);
    const localTime = Date.parse(localRecord.updatedAt || localRecord.recordedAt || 0) || 0;
    const incomingTime = Date.parse(incomingRecord.updatedAt || incomingRecord.recordedAt || 0) || 0;
    const newer = incomingTime > localTime ? incomingRecord : localRecord;
    const older = newer === incomingRecord ? localRecord : incomingRecord;
    const acquisitionMap = new Map();
    for (const acquisition of [...(older.acquisitions ?? []), ...(newer.acquisitions ?? [])]) {
      if (acquisition?.id) acquisitionMap.set(acquisition.id, acquisition);
    }

    return {
      ...structuredClone(older),
      ...structuredClone(newer),
      acquisitions: [...acquisitionMap.values()],
      officialTags: uniqueNonEmpty([
        ...(older.officialTags ?? []),
        ...(newer.officialTags ?? []),
      ]),
      userTags: uniqueNonEmpty([...(older.userTags ?? []), ...(newer.userTags ?? [])]),
      images: newer.images?.length ? structuredClone(newer.images) : structuredClone(older.images ?? []),
    };
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
  }

  function transactionToPromise(transaction) {
    return new Promise((resolve, reject) => {
      transaction.addEventListener('complete', resolve, { once: true });
      transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    });
  }

  function openArchiveDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('products')) {
          database.createObjectStore('products', { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains('images')) {
          database.createObjectStore('images', { keyPath: 'hash' });
        }
        if (!database.objectStoreNames.contains('handles')) {
          database.createObjectStore('handles');
        }
      });
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
      request.addEventListener('blocked', () => reject(new Error('数据库升级被其他页面阻止。')), {
        once: true,
      });
    });
  }

  async function databaseGet(storeName, key) {
    const database = await openArchiveDatabase();
    try {
      return await requestToPromise(database.transaction(storeName).objectStore(storeName).get(key));
    } finally {
      database.close();
    }
  }

  async function databasePut(storeName, value, key) {
    const database = await openArchiveDatabase();
    try {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      if (key === undefined) store.put(value);
      else store.put(value, key);
      await transactionToPromise(transaction);
    } finally {
      database.close();
    }
  }

  async function databaseDelete(storeName, key) {
    const database = await openArchiveDatabase();
    try {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(key);
      await transactionToPromise(transaction);
    } finally {
      database.close();
    }
  }

  async function databaseGetAll(storeName) {
    const database = await openArchiveDatabase();
    try {
      return await requestToPromise(database.transaction(storeName).objectStore(storeName).getAll());
    } finally {
      database.close();
    }
  }

  async function databaseCount(storeName) {
    const database = await openArchiveDatabase();
    try {
      return await requestToPromise(database.transaction(storeName).objectStore(storeName).count());
    } finally {
      database.close();
    }
  }

  /**
   * 生成Windows、macOS和Linux均较安全的文件名。
   * @param {unknown} value
   * @param {number} [maxLength]
   * @returns {string}
   */
  function sanitizeFilename(value, maxLength = 180) {
    let filename = normalizeSpaces(value)
      .replace(/[\u0000-\u001f\u007f]/gu, '')
      .replace(/[:?*"<>|/\\]/gu, (character) => INVALID_FILENAME_CHARS[character] ?? character)
      .replace(/[. ]+$/gu, '')
      .trim();

    const codePoints = [...filename];
    if (codePoints.length > maxLength) {
      filename = codePoints.slice(0, maxLength).join('').replace(/[. ]+$/gu, '').trim();
    }

    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(filename)) {
      filename = `_${filename}`;
    }

    return filename || 'cover';
  }

  /**
   * 对活动名进行保守的常用缩写和日期清理。
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeEventName(value) {
    return normalizeSpaces(value)
      .replace(/コミックマーケット\s*/gu, 'C')
      .replace(/こみっくトレジャー\s*/gu, 'こみトレ')
      .replace(/博麗神社\s*例大祭\s*\(第\s*(\d+)\s*回\)/gu, '例大祭$1')
      .replace(/\d{4}[/-]\d{1,2}[/-]\d{1,2}/gu, '')
      .replace(/\s+/gu, ' ')
      .trim();
  }

  /**
   * 从多个可能的字段名中返回第一个非空值。
   * @param {Record<string, string>} info
   * @param {...string} keys
   * @returns {string}
   */
  function pickField(info, ...keys) {
    for (const key of keys) {
      if (info[key]) return info[key];
    }
    return '';
  }

  /**
   * 生成可单独复制的规范化标题字段。
   * @param {{rawTitle?: string, info?: Record<string, string>}} product
   * @param {{includeBracketedContent?: boolean}} [options]
   * @returns {{event: string, circle: string, author: string, title: string, genre: string}}
   */
  function buildTitleParts(product, options = {}) {
    const info = product?.info ?? {};
    const rawTitle = normalizeSpaces(product?.rawTitle);
    const title =
      options.includeBracketedContent === false ? stripBracketedContent(rawTitle) : rawTitle;
    const circle = normalizeSpaces(pickField(info, 'サークル名', 'サークル'))
      .replace(/\s*\(作品数\s*[:：]\s*\d+\)\s*$/u, '')
      .trim();
    const author = normalizeSpaces(pickField(info, '作家名', '作家', '作者'));
    const event = normalizeEventName(pickField(info, 'イベント', '初出イベント'));
    const genre = normalizeSpaces(pickField(info, 'ジャンル', 'ジャンル/サブジャンル'));

    return { event, circle, author, title, genre };
  }

  /**
   * 生成字段复制按钮显示的文字；实际复制内容不受视觉截断影响。
   * @param {string} label
   * @param {string} value
   * @returns {string}
   */
  function formatFieldButtonText(label, value) {
    return `${normalizeSpaces(label)}：${normalizeSpaces(value)}`;
  }

  /**
   * 生成没有相应信息时的禁用按钮文字。
   * @param {string} label
   * @returns {string}
   */
  function formatUnavailableFieldButtonText(label) {
    return `无${normalizeSpaces(label)}信息`;
  }

  /**
   * 根据已提取的页面信息生成归档标题。
   * @param {{rawTitle?: string, info?: Record<string, string>}} product
   * @param {{includeBracketedContent?: boolean, includeEvent?: boolean, includeCircle?: boolean, includeAuthor?: boolean, includeGenre?: boolean}} [options]
   * @returns {string}
   */
  function buildTitle(product, options = {}) {
    const parts = buildTitleParts(product, options);
    const event = options.includeEvent === false ? '' : parts.event;
    const circle = options.includeCircle === false ? '' : parts.circle;
    const author = options.includeAuthor === false ? '' : parts.author;
    const genre = options.includeGenre === false ? '' : parts.genre;

    let creatorPart = '';
    if (circle) {
      let authorPart = '';
      if (options.includeAuthor !== false) {
        if (author) authorPart = ` (${author})`;
        else if (AUTHOR_PLACEHOLDER) authorPart = ' ()';
      }
      creatorPart = `[${circle}${authorPart}]`;
    } else if (author) {
      creatorPart = `[${author}]`;
    }

    return [event ? `(${event})` : '', creatorPart, parts.title, genre ? `(${genre})` : '']
      .filter(Boolean)
      .join(' ');
  }

  /**
   * 判断URL对应的站点适配器。
   * @param {URL|string} input
   * @returns {typeof SITE_DEFINITION | null}
   */
  function getSiteDefinition(input) {
    let url;
    try {
      url = input instanceof URL ? input : new URL(input);
    } catch {
      return null;
    }

    const isSupportedHost = SITE_DEFINITION.hostnames.includes(url.hostname);
    const isSupportedPath = SITE_DEFINITION.paths.includes(url.pathname);
    const hasProductId = /^\d+$/u.test(url.searchParams.get('product_id') ?? '');
    return isSupportedHost && isSupportedPath && hasProductId ? SITE_DEFINITION : null;
  }

  /**
   * 等待异步渲染的页面元素出现。
   * @param {string} selector
   * @param {number} [timeoutMs]
   * @returns {Promise<Element>}
   */
  function waitForElement(selector, timeoutMs = ELEMENT_WAIT_TIMEOUT_MS) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      let timerId;
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (!element) return;
        observer.disconnect();
        clearTimeout(timerId);
        resolve(element);
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
      timerId = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element not found: ${selector}`));
      }, timeoutMs);
    });
  }

  /**
   * 在指定选择器的元素中查找文本完全一致的一项。
   * @param {string} selector
   * @param {string} expectedText
   * @returns {Element|null}
   */
  function findElementByNormalizedText(selector, expectedText) {
    const compactExpectedText = normalizeSpaces(expectedText).replace(/\s/gu, '');
    return (
      [...document.querySelectorAll(selector)].find(
        (element) =>
          normalizeSpaces(element.textContent).replace(/\s/gu, '') === compactExpectedText
      ) ?? null
    );
  }

  /**
   * 保留原站按钮节点和事件，将收藏操作整体移动到配送方法区域上方。
   * @param {typeof SITE_DEFINITION} site
   * @returns {boolean}
   */
  function moveFavoriteActions(site) {
    const favoriteButtons = FAVORITE_ACTION_TEXTS.map((text) =>
      findElementByNormalizedText(site.favoriteActionSelector, text)
    );
    if (favoriteButtons.some((button) => !button)) return false;

    const favoriteGroup = favoriteButtons[0].closest(site.favoriteGroupSelector);
    const belongsToSameGroup = favoriteButtons.every(
      (button) => button.closest(site.favoriteGroupSelector) === favoriteGroup
    );
    if (!favoriteGroup || !belongsToSameGroup) return false;

    const deliveryTitle = findElementByNormalizedText(site.deliveryTitleSelector, '配送方法');
    const deliveryGroup = deliveryTitle?.closest(site.deliveryGroupSelector);
    if (!deliveryGroup) return false;

    deliveryGroup.before(favoriteGroup);
    return true;
  }

  /**
   * 读取表格单元格，优先使用链接文本以避免嵌套span造成重复。
   * @param {HTMLElement|null} cell
   * @returns {string}
   */
  function extractCellValue(cell) {
    if (!cell) return '';

    const links = uniqueNonEmpty(
      [...cell.querySelectorAll('a')].map((element) => element.innerText || element.textContent || '')
    );
    if (links.length) return links.join('、');

    return normalizeSpaces(cell.innerText || cell.textContent || '');
  }

  /**
   * Melonbooks将部分ジャンル保存在URL参数中，此处优先读取该值。
   * @param {HTMLElement|null} cell
   * @returns {string}
   */
  function extractMelonGenres(cell) {
    if (!cell) return '';
    const genres = [];

    for (const link of cell.querySelectorAll('a[href]')) {
      try {
        const url = new URL(link.getAttribute('href'), window.location.href);
        const genre = url.searchParams.get('genre');
        if (!genre) continue;
        genres.push(
          normalizeSpaces(genre.replace(/frm_spc/giu, ' ').replace(/frm_qes/giu, '?'))
        );
      } catch (error) {
        console.debug(`[${SCRIPT_LABEL}] Ignored invalid genre URL.`, error);
      }
    }

    return uniqueNonEmpty(genres).join('、');
  }

  /**
   * 从当前详情页提取标题与规格表字段。
   * @param {typeof SITE_DEFINITION} site
   * @returns {{rawTitle: string, info: Record<string, string>}}
   */
  function extractProduct(site) {
    const info = {};
    const titleElement = document.querySelector(site.titleSelector);
    const rawTitle = normalizeSpaces(titleElement?.innerText || titleElement?.textContent || '');

    for (const row of document.querySelectorAll(site.rowSelector)) {
      const keyCell = row.querySelector('th');
      const valueCell = row.querySelector('td');
      if (!keyCell || !valueCell) continue;
      const key = normalizeSpaces(keyCell.innerText || keyCell.textContent || '');
      if (!key) continue;

      const isGenre = key === 'ジャンル' || key === 'ジャンル/サブジャンル';
      const melonGenre = isGenre ? extractMelonGenres(valueCell) : '';
      info[key] = melonGenre || extractCellValue(valueCell);
    }

    return { rawTitle, info };
  }

  function getProductIdentity() {
    const canonicalValue = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    const canonicalUrl = toAbsoluteUrl(canonicalValue) ?? window.location.href;
    const url = new URL(canonicalUrl);
    const productId = url.searchParams.get('product_id') ?? '';
    return {
      source: 'melonbooks',
      productId,
      key: `melonbooks:${productId}`,
      canonicalUrl: `${url.origin}${url.pathname}?product_id=${encodeURIComponent(productId)}`,
    };
  }

  function extractHeaderClassifications() {
    const labels = [...document.querySelectorAll('.item-header > .item-notes')].map(
      (element) => element.innerText || element.textContent || ''
    );
    return classifyHeaderLabels(labels);
  }

  function extractOfficialTags() {
    const groups = [...document.querySelectorAll('p.mt6')]
      .map((container) =>
        uniqueNonEmpty(
          [...container.querySelectorAll('a')]
            .map((element) => normalizeSpaces(element.innerText || element.textContent || ''))
            .filter((text) => text.startsWith('#'))
            .map((text) => text.replace(/^#+/u, ''))
        )
      )
      .filter((tags) => tags.length);
    groups.sort((left, right) => right.length - left.length);
    return groups[0] ?? [];
  }

  function extractDetailSectionText(title) {
    const heading = [...document.querySelectorAll('.item-detail h3')].find(
      (element) => normalizeSpaces(element.textContent) === title
    );
    const section = heading?.closest('.item-detail');
    if (!section) return null;
    const clone = section.cloneNode(true);
    for (const element of clone.querySelectorAll('h3, script, style')) element.remove();
    for (const breakElement of clone.querySelectorAll('br')) {
      breakElement.replaceWith(document.createTextNode('\n'));
    }
    const lines = (clone.innerText || clone.textContent || '')
      .split(/\r?\n/u)
      .map(normalizeSpaces)
      .filter(Boolean);
    return lines.length ? lines.join('\n') : null;
  }

  function normalizeIsoDate(value) {
    const formatted = formatJapaneseDate(value);
    const match = formatted.match(/^(\d{4})年(\d{2})月(\d{2})日$/u);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  }

  function extractReleaseDate(site) {
    const text = normalizeSpaces(document.querySelector(site.releaseDateSelector)?.textContent);
    return normalizeIsoDate(text.replace(/^発売日\s*[:：]\s*/u, ''));
  }

  function extractTitleQualifiers(rawTitle) {
    return uniqueNonEmpty([...String(rawTitle ?? '').matchAll(/【([^】]*)】/gu)].map((match) => match[1]));
  }

  function getArchivableImageUrl(image) {
    if (!image) return null;
    const sourceUrl = getImageUrl(image);
    const deferredUrl = toAbsoluteUrl(
      image.dataset.src || image.dataset.original || image.getAttribute('data-lazy')
    );
    if (sourceUrl && !NOW_PRINTING_PATTERN.test(sourceUrl)) return sourceUrl;
    return deferredUrl || sourceUrl;
  }

  function collectProductImages(site) {
    const images = [];
    const seen = new Set();
    const append = (url, role, order) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      images.push({
        sourceUrl: url,
        role,
        order,
        isPlaceholder: NOW_PRINTING_PATTERN.test(url),
        storageStatus: 'remote',
        hash: null,
      });
    };

    const coverElement = site.coverSelectors
      .map((selector) => document.querySelector(selector))
      .find(Boolean);
    const galleryRoot =
      coverElement?.closest('.slider.my-gallery') ||
      coverElement?.closest('.main_image') ||
      coverElement?.closest('.item-main');
    const galleryElements = galleryRoot
      ? [...galleryRoot.querySelectorAll('img')]
      : uniqueNonEmpty(site.gallerySelectors).flatMap((selector) => [
          ...document.querySelectorAll(selector),
        ]);
    let galleryOrder = 0;
    for (const image of galleryElements) {
      append(getArchivableImageUrl(image), galleryOrder === 0 ? 'cover' : 'preview', galleryOrder);
      galleryOrder += 1;
    }

    let bonusOrder = 0;
    for (const selector of site.bonusImageSelectors) {
      for (const image of document.querySelectorAll(selector)) {
        append(getArchivableImageUrl(image), 'bonus', bonusOrder);
        bonusOrder += 1;
      }
    }
    return images;
  }

  function buildArchiveProduct(site, product, composedTitle) {
    const identity = getProductIdentity();
    const parts = buildTitleParts(product, { includeBracketedContent: true });
    const classifications = extractHeaderClassifications();
    const now = new Date().toISOString();
    return {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      productType: 'doujin',
      ...identity,
      originalTitle: product.rawTitle || null,
      composedTitle: normalizeSpaces(composedTitle),
      titleParts: {
        ...parts,
        eventFull: pickField(product.info, 'イベント', '初出イベント') || null,
        titleQualifiers: extractTitleQualifiers(product.rawTitle),
      },
      classifications: {
        ...classifications,
        detailAudience: pickField(product.info, '作品種別') || null,
      },
      officialTags: extractOfficialTags(),
      details: {
        releaseDate: extractReleaseDate(site),
        publicationDate: normalizeIsoDate(pickField(product.info, '発行日')),
        listedPrice: Number(extractNumericPrice(document.querySelector(site.priceSelector)?.textContent)) || null,
        currency: 'JPY',
        format: pickField(product.info, '版型・メディア') || null,
        pageCount: Number(pickField(product.info, '総ページ数・CG数・曲数')) || null,
        audience: pickField(product.info, '作品種別') || null,
        rawFields: { ...product.info },
      },
      descriptions: {
        bonusInformation: extractDetailSectionText('特典情報'),
        circleComment: extractDetailSectionText('サークル(先生)からのコメント/作品詳細'),
        staffRecommendation: extractDetailSectionText('スタッフのオススメポイント'),
      },
      images: collectProductImages(site),
      acquisitions: [],
      note: '',
      userTags: [],
      recordedAt: now,
      capturedAt: now,
      updatedAt: now,
      extractionWarnings: [],
    };
  }

  /**
   * 将详情表格中的発行日显示在页面原有発売日的正上方。
   * @param {typeof SITE_DEFINITION} site
   * @param {Record<string, string>} info
   * @returns {boolean}
   */
  function insertIssueDate(site, info) {
    if (document.getElementById(ISSUE_DATE_ID)) return false;

    const issueDateText = formatJapaneseDate(pickField(info, '発行日'));
    const releaseDateElement = document.querySelector(site.releaseDateSelector);
    if (!issueDateText || !releaseDateElement) return false;

    const issueDateElement = document.createElement('span');
    issueDateElement.id = ISSUE_DATE_ID;
    issueDateElement.className = releaseDateElement.className;
    issueDateElement.textContent = `発行日：${issueDateText}`;
    releaseDateElement.before(issueDateElement);
    return true;
  }

  /**
   * 为商品主价格启用鼠标和键盘复制，不修改页面显示的价格格式。
   * @param {typeof SITE_DEFINITION} site
   * @returns {boolean}
   */
  function enablePriceCopy(site) {
    const priceElement = document.querySelector(site.priceSelector);
    if (!priceElement || priceElement.dataset.melonArchiveCopyEnabled === 'true') return false;
    if (!extractNumericPrice(priceElement.textContent)) return false;

    const copyPrice = () => {
      const price = extractNumericPrice(priceElement.textContent);
      if (price) GM_setClipboard(price, 'text');
    };

    priceElement.dataset.melonArchiveCopyEnabled = 'true';
    priceElement.classList.add('melon-archive-price-copy');
    priceElement.tabIndex = 0;
    priceElement.setAttribute('role', 'button');
    priceElement.setAttribute('aria-label', '复制纯数字价格');
    priceElement.title = '点击复制纯数字价格';
    priceElement.addEventListener('click', copyPrice);
    priceElement.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      copyPrice();
    });
    return true;
  }

  /**
   * 将可能的相对图片地址转换为绝对URL。
   * @param {unknown} value
   * @returns {string|null}
   */
  function toAbsoluteUrl(value) {
    if (!value) return null;
    try {
      return new URL(String(value), window.location.href).href;
    } catch {
      return null;
    }
  }

  /**
   * 从img元素读取懒加载前后的图片地址。
   * @param {HTMLImageElement|null} image
   * @returns {string|null}
   */
  function getImageUrl(image) {
    if (!image) return null;
    return toAbsoluteUrl(
      image.currentSrc ||
        image.src ||
        image.dataset.src ||
        image.dataset.original ||
        image.getAttribute('data-lazy')
    );
  }

  /**
   * 按精确区域、Melonbooks兼容图片接口、Open Graph的顺序寻找封面。
   * @param {typeof SITE_DEFINITION} site
   * @returns {string|null}
   */
  function findCoverUrl(site) {
    for (const selector of site.coverSelectors) {
      const url = getImageUrl(document.querySelector(selector));
      if (url) return url;
    }

    const compatibleMelonImage = [...document.images].find((image) =>
      getImageUrl(image)?.includes('/user_data/packages/resize_image.php?image=')
    );
    const compatibleUrl = getImageUrl(compatibleMelonImage);
    if (compatibleUrl) return compatibleUrl;

    const openGraphUrl = toAbsoluteUrl(
      document.querySelector('meta[property="og:image"]')?.getAttribute('content')
    );
    return openGraphUrl;
  }

  /**
   * 通过用户脚本API下载封面Blob。
   * @param {string} url
   * @returns {Promise<Blob>}
   */
  function downloadBlob(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        timeout: DOWNLOAD_TIMEOUT_MS,
        headers: { Referer: window.location.href },
        onload: (response) => {
          if (response.status >= 200 && response.status < 300 && response.response?.size > 0) {
            resolve(response.response);
            return;
          }
          reject(new Error(`Cover request failed with HTTP ${response.status}.`));
        },
        onabort: () => reject(new Error('Cover request was aborted.')),
        onerror: () => reject(new Error('Cover request failed.')),
        ontimeout: () => reject(new Error('Cover request timed out.')),
      });
    });
  }

  async function hashBlob(blob) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  }

  async function readImageDimensions(blob) {
    if (typeof createImageBitmap !== 'function') return { width: null, height: null };
    const bitmap = await createImageBitmap(blob);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  async function createThumbnail(blob, maxWidth = 320) {
    if (typeof createImageBitmap !== 'function') return blob;
    const bitmap = await createImageBitmap(blob);
    try {
      if (bitmap.width <= maxWidth) return blob;
      const ratio = maxWidth / bitmap.width;
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return blob;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve) => {
        canvas.toBlob((thumbnail) => resolve(thumbnail || blob), 'image/webp', 0.82);
      });
    } finally {
      bitmap.close();
    }
  }

  function selectImagesForScope(images, scope) {
    if (scope === 'all') return images;
    const cover = images.find((image) => image.role === 'cover');
    return cover ? [cover] : [];
  }

  async function getArchiveDirectoryHandle() {
    return (await databaseGet('handles', DIRECTORY_HANDLE_KEY)) ?? null;
  }

  async function ensureDirectoryPermission(handle) {
    if (!handle) return false;
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission?.(options)) === 'granted') return true;
    return (await handle.requestPermission?.(options)) === 'granted';
  }

  async function selectArchiveDirectory() {
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error('当前浏览器不支持选择本地归档目录。请使用最新版Chrome或Edge。');
    }
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await databasePut('handles', handle, DIRECTORY_HANDLE_KEY);
    return handle;
  }

  async function writeBlobToDirectory(rootHandle, blob, hash, extension) {
    const imageDirectory = await rootHandle.getDirectoryHandle('images', { create: true });
    const filename = `${hash}.${extension}`;
    try {
      await imageDirectory.getFileHandle(filename);
      return `images/${filename}`;
    } catch (error) {
      if (error?.name !== 'NotFoundError') throw error;
    }
    const fileHandle = await imageDirectory.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return `images/${filename}`;
  }

  async function writeProductMetadataToDirectory(rootHandle, productRecord) {
    const productDirectory = await rootHandle.getDirectoryHandle('products', { create: true });
    const fileHandle = await productDirectory.getFileHandle(`${productRecord.productId}.json`, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(
      new Blob([JSON.stringify(productRecord, null, 2)], { type: 'application/json' })
    );
    await writable.close();
  }

  async function archiveProductImages(productRecord, settings) {
    const selected = selectImagesForScope(productRecord.images ?? [], settings.imageScope);
    let directoryHandle = null;
    if (settings.imageBackend === 'directory') {
      directoryHandle = await getArchiveDirectoryHandle();
      if (!(await ensureDirectoryPermission(directoryHandle))) {
        throw new Error('尚未授权本地图片归档目录，请先在设置中选择目录。');
      }
    }
    if (!selected.length) {
      if (directoryHandle) await writeProductMetadataToDirectory(directoryHandle, productRecord);
      return productRecord;
    }

    const selectedUrls = new Set(selected.map((image) => image.sourceUrl));
    const updatedImages = [];
    for (const image of productRecord.images ?? []) {
      if (!selectedUrls.has(image.sourceUrl)) {
        updatedImages.push(image);
        continue;
      }

      const desiredVariant =
        settings.imageScope === 'thumbnail' && image.role === 'cover' ? 'thumbnail' : 'full';
      const hasSuitableStoredCopy =
        image.storageStatus === 'stored' &&
        image.storageBackend === settings.imageBackend &&
        (image.storedVariant === desiredVariant ||
          (desiredVariant === 'thumbnail' && image.storedVariant === 'full'));
      if (hasSuitableStoredCopy) {
        updatedImages.push(image);
        continue;
      }

      try {
        const downloadedBlob = await downloadBlob(image.sourceUrl);
        const storedBlob =
          settings.imageScope === 'thumbnail' && image.role === 'cover'
            ? await createThumbnail(downloadedBlob)
            : downloadedBlob;
        const hash = await hashBlob(storedBlob);
        const dimensions = await readImageDimensions(storedBlob).catch(() => ({
          width: null,
          height: null,
        }));
        const extension = inferImageExtension(storedBlob.type, image.sourceUrl);
        let localPath = null;

        if (settings.imageBackend === 'browser') {
          await databasePut('images', {
            hash,
            blob: storedBlob,
            mimeType: storedBlob.type || 'application/octet-stream',
            byteSize: storedBlob.size,
            ...dimensions,
            isPlaceholder: image.isPlaceholder,
            recordedAt: new Date().toISOString(),
          });
        } else {
          localPath = await writeBlobToDirectory(directoryHandle, storedBlob, hash, extension);
        }

        updatedImages.push({
          ...image,
          hash,
          mimeType: storedBlob.type || null,
          byteSize: storedBlob.size,
          ...dimensions,
          localPath,
          storageBackend: settings.imageBackend,
          storageStatus: 'stored',
          storedVariant: desiredVariant,
        });
      } catch (error) {
        console.warn(`[${SCRIPT_LABEL}] Image archive failed.`, error);
        updatedImages.push({
          ...image,
          storageBackend: settings.imageBackend,
          storageStatus: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const updatedRecord = {
      ...productRecord,
      images: updatedImages,
      updatedAt: new Date().toISOString(),
    };
    if (directoryHandle) await writeProductMetadataToDirectory(directoryHandle, updatedRecord);
    return updatedRecord;
  }

  /**
   * 根据MIME类型或URL后缀判断图片扩展名。
   * @param {string} mimeType
   * @param {string} sourceUrl
   * @returns {string}
   */
  function inferImageExtension(mimeType, sourceUrl) {
    const normalizedMime = normalizeSpaces(mimeType).toLowerCase().split(';')[0];
    if (MIME_EXTENSIONS[normalizedMime]) return MIME_EXTENSIONS[normalizedMime];

    try {
      const match = new URL(sourceUrl).pathname.match(/\.([a-z0-9]{2,5})$/iu);
      const extension = match?.[1]?.toLowerCase();
      if (['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp'].includes(extension)) {
        return extension === 'jpeg' ? 'jpg' : extension;
      }
    } catch {
      // 使用默认扩展名。
    }
    return 'jpg';
  }

  /**
   * 使用浏览器原生Blob URL保存文件，避免依赖第三方FileSaver脚本。
   * @param {Blob} blob
   * @param {string} filename
   */
  function saveBlob(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }

  /**
   * 显示非阻塞提示。
   * @param {string} text
   */
  function notify(text) {
    if (typeof GM_notification === 'function') {
      GM_notification({ title: SCRIPT_LABEL, text });
      return;
    }
    console.info(`[${SCRIPT_LABEL}] ${text}`);
  }

  /**
   * @param {HTMLButtonElement} button
   * @param {string} text
   */
  function setButtonDone(button, text) {
    button.disabled = false;
    button.textContent = text;
    button.classList.remove('is-busy');
    button.classList.add('is-done');
  }

  function createRecordId() {
    return typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getOwnedQuantity(productRecord) {
    return (productRecord?.acquisitions ?? []).reduce(
      (total, acquisition) => total + Math.max(0, Number(acquisition.quantity) || 0),
      0
    );
  }

  function updatePurchaseControls(button, editButton, productRecord) {
    const quantity = getOwnedQuantity(productRecord);
    button.textContent = quantity > 1 ? `✅已购入 ×${quantity}` : quantity === 1 ? '✅已购入' : '🛍️标记已购入';
    button.title = quantity ? `持有数量：${quantity}；使用右侧齿轮修改记录` : '立即标记为已购入';
    button.classList.toggle('is-done', quantity > 0);
    editButton.hidden = quantity === 0;
    editButton.title = quantity ? `修改购入记录（持有${quantity}件）` : '尚无购入记录';
  }

  function parseUserTags(value) {
    return uniqueNonEmpty(String(value ?? '').split(/[,，、\n]/u));
  }

  function mergeImageReferences(existingImages, freshImages) {
    const existingByUrl = new Map(
      (existingImages ?? []).filter((image) => image?.sourceUrl).map((image) => [image.sourceUrl, image])
    );
    const merged = (freshImages ?? []).map((image) => ({
      ...image,
      ...(existingByUrl.get(image.sourceUrl) ?? {}),
      role: image.role,
      order: image.order,
    }));
    const freshUrls = new Set(merged.map((image) => image.sourceUrl));
    return [...merged, ...(existingImages ?? []).filter((image) => !freshUrls.has(image.sourceUrl))];
  }

  function mergePageProduct(site, product, composedTitle, existingRecord) {
    const freshRecord = buildArchiveProduct(site, product, composedTitle);
    return existingRecord
      ? {
          ...freshRecord,
          acquisitions: [...(existingRecord.acquisitions ?? [])],
          note: existingRecord.note ?? '',
          userTags: [...(existingRecord.userTags ?? [])],
          images: mergeImageReferences(existingRecord.images, freshRecord.images),
          recordedAt: existingRecord.recordedAt ?? freshRecord.recordedAt,
        }
      : freshRecord;
  }

  async function quickAddPurchase(site, product, composedTitle, existingRecord) {
    const record = mergePageProduct(site, product, composedTitle, existingRecord);
    if (getOwnedQuantity(record) > 0) return record;
    const publicationDate = record.details?.publicationDate ?? '';
    record.acquisitions.push(
      createAcquisition({
        purchaseDate: publicationDate,
        purchaseDateIsDefault: Boolean(publicationDate),
      })
    );
    record.updatedAt = new Date().toISOString();
    await databasePut('products', record);
    return record;
  }

  async function openPurchaseEditor(getTitle, purchaseButton, editButton) {
    if (document.getElementById(PURCHASE_MODAL_ID)) return false;
    let currentRecord = (await databaseGet('products', getProductIdentity().key)) ?? null;
    if (!currentRecord || getOwnedQuantity(currentRecord) === 0) {
      notify('当前商品还没有可修改的购入记录。');
      return false;
    }
    const originalAcquisitions = new Map(
      (currentRecord.acquisitions ?? []).map((acquisition) => [acquisition.id, acquisition])
    );
    const draftAcquisitions = (currentRecord.acquisitions ?? []).map((acquisition) => ({
      ...acquisition,
      purchasedOn: acquisition.purchasedOn ? { ...acquisition.purchasedOn } : null,
    }));
    const previousFocus = document.activeElement;
    const host = document.createElement('div');
    host.id = PURCHASE_MODAL_ID;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${SETTINGS_STYLES}</style>
      <div class="backdrop">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="melon-archive-purchase-title">
          <header class="header">
            <h2 id="melon-archive-purchase-title">⚙️ 修改购入记录</h2>
            <button class="close" type="button" data-action="close" aria-label="关闭">×</button>
          </header>
          <form>
            <div class="body">
              <p class="summary" data-role="title"></p>
              <fieldset>
                <legend>购入批次</legend>
                <ul class="record-list" data-role="record-list"></ul>
                <div class="inline-actions"><button type="button" data-action="add-batch">＋添加购入批次</button></div>
                <p class="hint">购入日固定为日精度并可留空；持有数量由所有批次数量合计得出。删除批次后需点击保存才会生效。</p>
              </fieldset>
              <fieldset>
                <legend>个人整理</legend>
                <label class="field"><span>用户备注</span><textarea name="note"></textarea></label>
                <label class="field"><span>自定义标签</span><input name="userTags" type="text" placeholder="使用逗号分隔"></label>
              </fieldset>
              <p class="status" data-role="status"></p>
            </div>
            <footer class="actions">
              <button type="button" data-action="close">取消</button>
              <button class="save" type="submit">保存修改</button>
            </footer>
          </form>
        </section>
      </div>
    `;

    const form = shadow.querySelector('form');
    const backdrop = shadow.querySelector('.backdrop');
    const recordList = shadow.querySelector('[data-role="record-list"]');
    const status = shadow.querySelector('[data-role="status"]');
    shadow.querySelector('[data-role="title"]').textContent = getTitle();
    form.elements.note.value = currentRecord?.note ?? '';
    form.elements.userTags.value = (currentRecord?.userTags ?? []).join('、');

    const close = () => {
      host.remove();
      previousFocus?.focus?.();
    };
    const renderAcquisitions = () => {
      recordList.replaceChildren();
      for (const acquisition of draftAcquisitions) {
        const item = document.createElement('li');
        item.className = 'record-row';
        item.dataset.acquisitionId = acquisition.id;
        const dateLabel = document.createElement('label');
        dateLabel.className = 'field';
        dateLabel.innerHTML = '<span>购入日</span>';
        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.name = `purchaseDate-${acquisition.id}`;
        dateInput.value = acquisition.purchasedOn?.precision === 'day' ? acquisition.purchasedOn.value : '';
        dateInput.addEventListener('input', () => {
          item.dataset.dateTouched = 'true';
          item.querySelector('.default-date')?.remove();
        });
        dateLabel.append(dateInput);
        const quantityLabel = document.createElement('label');
        quantityLabel.className = 'field';
        quantityLabel.innerHTML = '<span>数量</span>';
        const quantityInput = document.createElement('input');
        quantityInput.type = 'number';
        quantityInput.name = `quantity-${acquisition.id}`;
        quantityInput.min = '1';
        quantityInput.max = '999';
        quantityInput.step = '1';
        quantityInput.required = true;
        quantityInput.value = String(acquisition.quantity);
        quantityLabel.append(quantityInput);
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'danger';
        removeButton.textContent = '删除';
        removeButton.addEventListener('click', () => {
          draftAcquisitions.splice(
            draftAcquisitions.findIndex((candidate) => candidate.id === acquisition.id),
            1
          );
          renderAcquisitions();
        });
        item.append(dateLabel, quantityLabel, removeButton);
        if (acquisition.purchaseDateIsDefault) {
          const hint = document.createElement('p');
          hint.className = 'default-date';
          hint.textContent = '此日期由商品発行日自动填写；手动修改后将不再标记为默认值。';
          item.append(hint);
        } else if (acquisition.purchasedOn && acquisition.purchasedOn.precision !== 'day') {
          const hint = document.createElement('p');
          hint.className = 'default-date';
          hint.textContent = `旧记录日期为${acquisition.purchasedOn.value}；未修改时保留原值，修改时请选择完整日期。`;
          item.append(hint);
        }
        recordList.append(item);
      }
      if (draftAcquisitions.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'hint';
        empty.textContent = '没有购入批次；保存后该商品将不再显示为已购入。';
        recordList.append(empty);
      }
    };
    renderAcquisitions();

    shadow.querySelector('[data-action="add-batch"]').addEventListener('click', () => {
      draftAcquisitions.push(createAcquisition());
      renderAcquisitions();
      recordList.lastElementChild?.querySelector('input')?.focus();
    });

    for (const button of shadow.querySelectorAll('[data-action="close"]')) {
      button.addEventListener('click', close);
    }
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
    host.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      for (const button of form.querySelectorAll('button')) button.disabled = true;
      status.textContent = '正在保存购入记录…';
      try {
        const acquisitions = draftAcquisitions.map((draft) => {
          const row = recordList.querySelector(`[data-acquisition-id="${CSS.escape(draft.id)}"]`);
          const dateInput = row.querySelector(`input[name="purchaseDate-${CSS.escape(draft.id)}"]`);
          const quantityInput = row.querySelector(`input[name="quantity-${CSS.escape(draft.id)}"]`);
          const original = originalAcquisitions.get(draft.id);
          const acquisition = createAcquisition({
            id: draft.id,
            purchaseDate: dateInput.value,
            quantity: Number(quantityInput.value),
            purchaseDateIsDefault: Boolean(
              original?.purchaseDateIsDefault && row.dataset.dateTouched !== 'true'
            ),
            recordedAt: draft.recordedAt,
          });
          if (
            original?.purchasedOn?.precision !== 'day' &&
            original?.purchasedOn &&
            row.dataset.dateTouched !== 'true'
          ) {
            acquisition.purchasedOn = { ...original.purchasedOn };
            acquisition.purchaseDateIsDefault = false;
          }
          return acquisition;
        });
        currentRecord = {
          ...currentRecord,
          acquisitions,
          note: form.elements.note.value.trim(),
          userTags: parseUserTags(form.elements.userTags.value),
          updatedAt: new Date().toISOString(),
        };
        await databasePut('products', currentRecord);
        updatePurchaseControls(purchaseButton, editButton, currentRecord);
        close();
        notify('购入记录已更新。');
      } catch (error) {
        console.error(`[${SCRIPT_LABEL}] Purchase record update failed.`, error);
        status.textContent = error instanceof Error ? error.message : String(error);
        for (const button of form.querySelectorAll('button')) button.disabled = false;
      }
    });

    document.documentElement.append(host);
    recordList.querySelector('input')?.focus();
    return true;
  }

  async function exportArchiveMetadata() {
    const products = await databaseGetAll('products');
    const backup = {
      application: SCRIPT_LABEL,
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      includesImageData: false,
      products,
    };
    const date = new Date().toISOString().slice(0, 10);
    saveBlob(
      new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
      `melon-archive-records-${date}.json`
    );
    return products.length;
  }

  async function importArchiveMetadata(file) {
    const backup = JSON.parse(await file.text());
    if (
      !backup ||
      backup.application !== SCRIPT_LABEL ||
      backup.schemaVersion !== ARCHIVE_SCHEMA_VERSION ||
      !Array.isArray(backup.products)
    ) {
      throw new Error('这不是受支持的Melon Archive备份文件。');
    }
    let imported = 0;
    for (const incoming of backup.products) {
      if (!incoming?.key || !incoming.productId || !Array.isArray(incoming.acquisitions)) continue;
      const local = await databaseGet('products', incoming.key);
      await databasePut('products', mergeProductRecords(local, incoming));
      imported += 1;
    }
    return imported;
  }

  async function summarizeArchive() {
    const products = await databaseGetAll('products');
    const images = await databaseGetAll('images');
    return {
      productCount: products.filter((product) => getOwnedQuantity(product) > 0).length,
      ownedQuantity: products.reduce((sum, product) => sum + getOwnedQuantity(product), 0),
      imageCount: images.length,
      imageBytes: images.reduce((sum, image) => sum + (Number(image.byteSize) || 0), 0),
    };
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KiB', 'MiB', 'GiB', 'TiB'];
    let amount = bytes;
    let unit = units[0];
    for (const nextUnit of units) {
      amount /= 1024;
      unit = nextUnit;
      if (amount < 1024) break;
    }
    return `${amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2)} ${unit}`;
  }

  /**
   * @param {string} label
   * @param {string} [modifier]
   * @returns {HTMLButtonElement}
   */
  function createButton(label, modifier = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `melon-archive-button${modifier ? ` melon-archive-button--${modifier}` : ''}`;
    button.textContent = label;
    button.title = label;
    return button;
  }

  /**
   * 复制单个规范化字段。
   * @param {string} value
   * @param {string} label
   * @param {HTMLButtonElement} button
   */
  function copyField(value, label, button) {
    if (!value) return;
    GM_setClipboard(value, 'text');
    setButtonDone(button, `✅ ${label}已复制`);
    const previousTimer = Number(button.dataset.resetTimer);
    if (previousTimer) window.clearTimeout(previousTimer);
    button.dataset.resetTimer = String(
      window.setTimeout(() => {
        button.textContent = button.dataset.defaultText ?? button.textContent;
        button.classList.remove('is-done');
        delete button.dataset.resetTimer;
      }, 1_200)
    );
  }

  /**
   * 生成并复制当前商品标题。
   * @param {() => string} getTitle
   * @param {HTMLButtonElement} button
   * @returns {string|null}
   */
  function copyTitle(getTitle, button) {
    const title = getTitle();
    if (!title) {
      button.textContent = '❌ 未找到标题';
      notify('未能从页面提取商品标题，页面结构可能已经变化。');
      return null;
    }

    GM_setClipboard(title, 'text');
    setButtonDone(button, '✅ 已复制');
    return title;
  }

  /**
   * 下载封面；仅在用户显式启用设置时同时复制标题。
   * @param {typeof SITE_DEFINITION} site
   * @param {() => string} getTitle
   * @param {HTMLButtonElement} button
   * @param {boolean} copyTitleOnDownload
   */
  async function downloadCover(site, getTitle, button, copyTitleOnDownload) {
    const title = getTitle();
    if (!title) {
      button.textContent = '❌ 未找到标题';
      notify('未能从页面提取商品标题，页面结构可能已经变化。');
      return;
    }
    if (copyTitleOnDownload) GM_setClipboard(title, 'text');

    const coverUrl = findCoverUrl(site);
    if (!coverUrl) {
      button.textContent = '❌ 未找到封面';
      notify('未找到封面图片，图片可能尚未加载或页面结构已经变化。');
      return;
    }

    button.disabled = true;
    button.classList.add('is-busy');
    button.textContent = '⏳ 下载中…';

    try {
      const blob = await downloadBlob(coverUrl);
      const extension = inferImageExtension(blob.type, coverUrl);
      saveBlob(blob, `${sanitizeFilename(title)}.${extension}`);
      setButtonDone(button, '✅ 已下载');
    } catch (error) {
      console.error(`[${SCRIPT_LABEL}] Cover download failed.`, error);
      button.disabled = false;
      button.classList.remove('is-busy');
      button.textContent = '❌ 下载失败';
      notify(`封面下载失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * @param {HTMLFormElement} form
   * @param {typeof DEFAULT_SETTINGS} settings
   */
  function writeSettingsForm(form, settings) {
    for (const input of form.querySelectorAll('[data-setting]')) {
      if (input.type === 'checkbox') input.checked = Boolean(settings[input.dataset.setting]);
      else input.value = settings[input.dataset.setting];
    }
  }

  /**
   * @param {HTMLFormElement} form
   * @returns {typeof DEFAULT_SETTINGS}
   */
  function readSettingsForm(form) {
    const settings = { schemaVersion: SETTINGS_SCHEMA_VERSION };
    for (const input of form.querySelectorAll('[data-setting]')) {
      settings[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.value;
    }
    return normalizeSettings(settings);
  }

  /**
   * 在Shadow DOM中显示设置窗口，避免与商店页面样式相互影响。
   * @returns {boolean}
   */
  function openSettingsDialog() {
    if (document.getElementById(SETTINGS_MODAL_ID)) return false;

    const previousFocus = document.activeElement;
    const host = document.createElement('div');
    host.id = SETTINGS_MODAL_ID;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${SETTINGS_STYLES}</style>
      <div class="backdrop">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="melon-archive-settings-title">
          <header class="header">
            <h2 id="melon-archive-settings-title">⚙️ Melon Archive 设置</h2>
            <button class="close" type="button" data-action="close" aria-label="关闭设置">×</button>
          </header>
          <form>
            <div class="body">
              <fieldset>
                <legend>页面功能</legend>
                <label class="option"><input type="checkbox" data-setting="includeBracketedContent">默认表示【】内容</label>
                <label class="option"><input type="checkbox" data-setting="enablePriceCopy">启用价格点击复制</label>
                <label class="option"><input type="checkbox" data-setting="showIssueDate">显示発行日</label>
                <label class="option"><input type="checkbox" data-setting="moveFavoriteActions">移动收藏与愿望单按钮</label>
                <label class="option"><input type="checkbox" data-setting="showFieldButtons">显示五个字段复制按钮</label>
                <label class="option"><input type="checkbox" data-setting="enablePurchaseRecords">启用私人购买记录</label>
                <label class="option"><input type="checkbox" data-setting="copyTitleOnDownload">下载封面时同时复制标题</label>
              </fieldset>
              <fieldset>
                <legend>拼接标题格式</legend>
                <label class="option"><input type="checkbox" data-setting="includeEvent">包含展会</label>
                <label class="option"><input type="checkbox" data-setting="includeCircle">包含社团</label>
                <label class="option"><input type="checkbox" data-setting="includeAuthor">包含作者</label>
                <label class="option"><input type="checkbox" data-setting="includeGenre">包含分类</label>
                <p class="hint">商品标题始终保留。设置保存后将刷新当前页面。</p>
              </fieldset>
              <fieldset>
                <legend>购买记录图片</legend>
                <label class="field"><span>图片保存后端</span><select data-setting="imageBackend">
                  <option value="browser">浏览器数据库</option>
                  <option value="directory">用户指定的本地目录</option>
                </select></label>
                <label class="field"><span>保存范围</span><select data-setting="imageScope">
                  <option value="thumbnail">仅保存压缩封面缩略图（推荐）</option>
                  <option value="cover">保存完整封面</option>
                  <option value="all">保存封面、预览图和特典图</option>
                </select></label>
                <div class="inline-actions">
                  <button type="button" data-action="directory">📁选择本地归档目录</button>
                  <button type="button" data-action="persist">🛡️申请浏览器持久存储</button>
                </div>
                <p class="hint">本地目录功能需要Chrome或Edge。请只授权专用目录；图片按SHA-256去重。</p>
                <p class="status" data-role="directory-status"></p>
              </fieldset>
              <fieldset>
                <legend>数据库与备份</legend>
                <p class="status" data-role="archive-status">正在读取数据库状态…</p>
                <div class="inline-actions">
                  <button type="button" data-action="export">⬇️导出记录JSON</button>
                  <button type="button" data-action="import">⬆️合并导入JSON</button>
                  <input type="file" accept="application/json,.json" data-role="import-file" hidden>
                </div>
                <p class="hint">JSON包含商品资料和购买记录，不包含浏览器数据库中的图片Blob。本地目录中的图片文件不会被修改。</p>
              </fieldset>
            </div>
            <footer class="actions">
              <button type="button" data-action="reset">恢复默认</button>
              <button type="button" data-action="close">取消</button>
              <button class="save" type="submit">保存并刷新</button>
            </footer>
          </form>
        </section>
      </div>
    `;

    const form = shadow.querySelector('form');
    const backdrop = shadow.querySelector('.backdrop');
    const archiveStatus = shadow.querySelector('[data-role="archive-status"]');
    const directoryStatus = shadow.querySelector('[data-role="directory-status"]');
    const importFile = shadow.querySelector('[data-role="import-file"]');
    writeSettingsForm(form, loadSettings());

    const refreshArchiveStatus = async () => {
      try {
        const summary = await summarizeArchive();
        archiveStatus.textContent = `已购买商品${summary.productCount}件，持有数量${summary.ownedQuantity}，浏览器图片${summary.imageCount}张（${formatBytes(summary.imageBytes)}）。`;
        const handle = await getArchiveDirectoryHandle();
        directoryStatus.textContent = handle
          ? `已选择目录：${handle.name}（写入时可能需要重新授权）`
          : '尚未选择本地归档目录。';
      } catch (error) {
        archiveStatus.textContent = `数据库状态读取失败：${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    };
    void refreshArchiveStatus();

    const close = () => {
      host.remove();
      previousFocus?.focus?.();
    };

    for (const button of shadow.querySelectorAll('[data-action="close"]')) {
      button.addEventListener('click', close);
    }
    shadow.querySelector('[data-action="reset"]').addEventListener('click', () => {
      writeSettingsForm(form, DEFAULT_SETTINGS);
    });
    shadow.querySelector('[data-action="directory"]').addEventListener('click', async () => {
      directoryStatus.textContent = '正在选择目录…';
      try {
        const handle = await selectArchiveDirectory();
        directoryStatus.textContent = `已选择目录：${handle.name}`;
        form.querySelector('[data-setting="imageBackend"]').value = 'directory';
      } catch (error) {
        if (error?.name === 'AbortError') directoryStatus.textContent = '已取消选择目录。';
        else directoryStatus.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    shadow.querySelector('[data-action="persist"]').addEventListener('click', async () => {
      if (!navigator.storage?.persist) {
        directoryStatus.textContent = '当前浏览器不支持持久存储申请。';
        return;
      }
      try {
        const persisted = await navigator.storage.persist();
        directoryStatus.textContent = persisted
          ? '浏览器已允许持久保存站点数据库；用户主动清除数据时仍会删除。'
          : '浏览器未批准持久存储申请，请继续定期导出备份。';
      } catch (error) {
        directoryStatus.textContent = `持久存储申请失败：${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    });
    shadow.querySelector('[data-action="export"]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const count = await exportArchiveMetadata();
        archiveStatus.textContent = `已导出${count}条商品记录。`;
      } catch (error) {
        archiveStatus.textContent = `导出失败：${error instanceof Error ? error.message : String(error)}`;
      } finally {
        button.disabled = false;
      }
    });
    shadow.querySelector('[data-action="import"]').addEventListener('click', () => {
      importFile.value = '';
      importFile.click();
    });
    importFile.addEventListener('change', async () => {
      const file = importFile.files?.[0];
      if (!file) return;
      archiveStatus.textContent = '正在合并导入记录…';
      try {
        const count = await importArchiveMetadata(file);
        archiveStatus.textContent = `已合并导入${count}条商品记录。`;
        await refreshArchiveStatus();
      } catch (error) {
        archiveStatus.textContent = `导入失败：${error instanceof Error ? error.message : String(error)}`;
      }
    });
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
    host.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveSettings(readSettingsForm(form));
      window.location.reload();
    });

    document.documentElement.append(host);
    shadow.querySelector('input[data-setting]')?.focus();
    return true;
  }

  function registerSettingsMenu() {
    GM_registerMenuCommand('⚙️ Melon Archive 设置', openSettingsDialog);
  }

  /**
   * @param {typeof SITE_DEFINITION} site
   * @param {typeof DEFAULT_SETTINGS} settings
   */
  async function injectUi(site, settings) {
    if (document.getElementById(UI_ID)) return;

    try {
      const anchor = await waitForElement(site.anchorSelector);
      if (document.getElementById(UI_ID)) return;

      const container = document.createElement('div');
      container.id = UI_ID;
      container.setAttribute('role', 'group');
      container.setAttribute('aria-label', '同人志归档操作');
      container.style.setProperty('--melon-archive-copy-color', site.copyButtonColor);
      container.style.setProperty('--melon-archive-download-color', site.downloadButtonColor);
      container.style.setProperty('--melon-archive-purchase-color', site.purchaseButtonColor);
      container.style.setProperty('--melon-archive-action-text', site.actionTextColor);

      const buttonGroup = document.createElement('div');
      buttonGroup.className = 'melon-archive-buttons';
      const copyButton = createButton('📋复制信息', 'copy');
      const downloadButton = createButton('📥下载封面', 'download');
      const purchaseButton = createButton('🛍️标记已购入', 'purchase');
      const purchaseEditButton = createButton('⚙️', 'purchase-edit');
      purchaseEditButton.hidden = true;
      purchaseEditButton.setAttribute('aria-label', '修改购入记录');
      const product = extractProduct(site);
      const isDoujinProduct = extractHeaderClassifications().headerLabels.some((label) =>
        label.includes('同人')
      );
      if (settings.showIssueDate) insertIssueDate(site, product.info);
      if (settings.enablePriceCopy) enablePriceCopy(site);
      let includeBracketedContent = settings.includeBracketedContent;

      const getCurrentOptions = () => ({
        includeBracketedContent,
        includeEvent: settings.includeEvent,
        includeCircle: settings.includeCircle,
        includeAuthor: settings.includeAuthor,
        includeGenre: settings.includeGenre,
      });
      const getCurrentParts = () =>
        buildTitleParts(product, { includeBracketedContent });
      const getCurrentTitle = () => buildTitle(product, getCurrentOptions());
      const updatePageTitle = () => {
        const title = getCurrentTitle();
        if (title) anchor.textContent = title;
      };

      copyButton.addEventListener('click', () => copyTitle(getCurrentTitle, copyButton));
      downloadButton.addEventListener('click', () =>
        void downloadCover(site, getCurrentTitle, downloadButton, settings.copyTitleOnDownload)
      );
      purchaseButton.addEventListener('click', () => {
        void (async () => {
          const storedRecord = await databaseGet('products', getProductIdentity().key);
          if (getOwnedQuantity(storedRecord) > 0) {
            notify('该商品已购入，请使用右侧齿轮修改记录。');
            return;
          }
          purchaseButton.disabled = true;
          purchaseButton.classList.add('is-busy');
          purchaseButton.textContent = '⏳正在入库…';
          let savedRecord = await quickAddPurchase(
            site,
            product,
            getCurrentTitle(),
            storedRecord
          );
          updatePurchaseControls(purchaseButton, purchaseEditButton, savedRecord);
          purchaseButton.textContent = '⏳归档图片…';
          try {
            savedRecord = await archiveProductImages(savedRecord, settings);
            await databasePut('products', savedRecord);
            notify('购入记录和图片归档已保存。');
          } catch (archiveError) {
            console.warn(`[${SCRIPT_LABEL}] Purchase saved without image archive.`, archiveError);
            notify(
              `购入记录已保存，但图片归档失败：${
                archiveError instanceof Error ? archiveError.message : String(archiveError)
              }`
            );
          } finally {
            purchaseButton.disabled = false;
            purchaseButton.classList.remove('is-busy');
            updatePurchaseControls(purchaseButton, purchaseEditButton, savedRecord);
          }
        })().catch((error) => {
          console.error(`[${SCRIPT_LABEL}] Purchase quick add failed.`, error);
          purchaseButton.disabled = false;
          purchaseButton.classList.remove('is-busy');
          updatePurchaseControls(purchaseButton, purchaseEditButton, null);
          notify(`购入记录保存失败：${error instanceof Error ? error.message : String(error)}`);
        });
      });
      purchaseEditButton.addEventListener('click', () => {
        void openPurchaseEditor(getCurrentTitle, purchaseButton, purchaseEditButton).catch(
          (error) => {
            console.error(`[${SCRIPT_LABEL}] Purchase editor failed.`, error);
            notify(`购入记录无法打开：${error instanceof Error ? error.message : String(error)}`);
          }
        );
      });

      const fieldPanelTarget = document.querySelector(site.fieldPanelSelector);
      const fieldPanel = document.createElement('div');
      fieldPanel.id = FIELD_PANEL_ID;
      fieldPanel.setAttribute('role', 'group');
      fieldPanel.setAttribute('aria-label', '单项信息复制');
      fieldPanel.style.setProperty('--melon-archive-field-color', site.fieldButtonColor);
      fieldPanel.style.setProperty('--melon-archive-field-text', site.fieldButtonTextColor);
      fieldPanel.style.setProperty(
        '--melon-archive-field-unavailable-color',
        site.unavailableFieldButtonColor
      );
      fieldPanel.style.setProperty(
        '--melon-archive-field-unavailable-text',
        site.unavailableFieldButtonTextColor
      );

      const fieldButtons = FIELD_COPY_BUTTONS.map(({ key, label }) => {
        const button = createButton('', 'field');
        button.addEventListener('click', () => copyField(getCurrentParts()[key], label, button));
        return { key, label, button };
      });

      const updateFieldButtons = () => {
        const parts = getCurrentParts();
        for (const { key, label, button } of fieldButtons) {
          const value = parts[key];
          const isAvailable = Boolean(value);
          const text = isAvailable
            ? formatFieldButtonText(label, value)
            : formatUnavailableFieldButtonText(label);
          button.disabled = !isAvailable;
          button.classList.toggle('is-unavailable', !isAvailable);
          button.textContent = text;
          button.title = text;
          button.dataset.defaultText = text;
        }
      };

      buttonGroup.append(copyButton, downloadButton);
      if (settings.enablePurchaseRecords && isDoujinProduct) {
        buttonGroup.append(purchaseButton, purchaseEditButton);
        try {
          const storedProduct = await databaseGet('products', getProductIdentity().key);
          updatePurchaseControls(purchaseButton, purchaseEditButton, storedProduct);
        } catch (error) {
          console.warn(`[${SCRIPT_LABEL}] Purchase database is unavailable.`, error);
          purchaseButton.disabled = true;
          purchaseButton.textContent = '❌记录不可用';
        }
      }

      if (hasBracketedContent(product.rawTitle)) {
        const optionLabel = document.createElement('label');
        optionLabel.className = 'melon-archive-option';
        const includeBracketedCheckbox = document.createElement('input');
        includeBracketedCheckbox.type = 'checkbox';
        includeBracketedCheckbox.checked = settings.includeBracketedContent;
        const optionText = document.createElement('span');
        optionText.textContent = '表示【】内容';
        optionLabel.append(includeBracketedCheckbox, optionText);

        includeBracketedCheckbox.addEventListener('change', () => {
          includeBracketedContent = includeBracketedCheckbox.checked;
          updatePageTitle();
          updateFieldButtons();
        });
        buttonGroup.append(optionLabel);
      }

      container.append(buttonGroup);
      anchor.after(container);
      if (settings.showFieldButtons) {
        updateFieldButtons();
        const fieldButtonElements = fieldButtons.map(({ button }) => button);
        fieldPanel.append(...fieldButtonElements);
        if (fieldPanelTarget) {
          fieldPanelTarget.classList.add('melon-archive-has-fields');
          fieldPanelTarget.prepend(fieldPanel);
        } else {
          fieldPanel.classList.add('melon-archive-fields--fallback');
          container.append(fieldPanel);
        }
      }
      updatePageTitle();
      if (settings.moveFavoriteActions) moveFavoriteActions(site);
    } catch (error) {
      console.error(`[${SCRIPT_LABEL}] UI injection failed.`, error);
      notify(`按钮注入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function main() {
    registerSettingsMenu();
    const site = getSiteDefinition(window.location.href);
    if (!site) return;
    const settings = loadSettings();
    GM_addStyle(STYLES);
    void injectUi(site, settings);
  }

  // 仅供Node内置测试运行；用户脚本环境不会进入此分支。
  if (typeof module === 'object' && module.exports) {
    module.exports = {
      buildTitle,
      buildTitleParts,
      classifyHeaderLabels,
      createAcquisition,
      enablePriceCopy,
      extractNumericPrice,
      formatBytes,
      formatFieldButtonText,
      formatJapaneseDate,
      formatUnavailableFieldButtonText,
      getOwnedQuantity,
      getSiteDefinition,
      hasBracketedContent,
      inferImageExtension,
      insertIssueDate,
      mergeProductRecords,
      moveFavoriteActions,
      normalizeEventName,
      normalizePurchaseDate,
      normalizeSettings,
      normalizeSpaces,
      saveSettings,
      sanitizeFilename,
      stripBracketedContent,
    };
  } else {
    main();
  }
})();
