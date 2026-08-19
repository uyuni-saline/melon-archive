// ==UserScript==
// @name         Melon Archive
// @namespace    https://github.com/uyuni-saline
// @version      1.6.0
// @description  在Melonbooks商品页生成规范标题，并复制标题或下载封面。
// @author       Saline
// @homepageURL  https://github.com/uyuni-saline/melon-archive
// @supportURL   https://github.com/uyuni-saline/melon-archive/issues
// @updateURL    https://raw.githubusercontent.com/uyuni-saline/melon-archive/main/melon-archive.user.js
// @downloadURL  https://raw.githubusercontent.com/uyuni-saline/melon-archive/main/melon-archive.user.js
// @match        https://www.melonbooks.co.jp/detail/detail.php*
// @match        https://www.melonbooks.co.jp/products/detail.php*
// @connect      *
// @grant        GM_addStyle
// @grant        GM_notification
// @grant        GM_setClipboard
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
  const AUTHOR_PLACEHOLDER = true;
  const ELEMENT_WAIT_TIMEOUT_MS = 12_000;
  const DOWNLOAD_TIMEOUT_MS = 30_000;

  const SITE_DEFINITION = Object.freeze({
    hostnames: ['www.melonbooks.co.jp'],
    paths: ['/detail/detail.php', '/products/detail.php'],
    anchorSelector: '.page-header',
    titleSelector: '.page-header',
    rowSelector: '.item-detail .table-wrapper tr',
    releaseDateSelector: '.item-metas-wrap .product-info__release-date',
    fieldPanelSelector: '.item-metas-wrap .item-meta3',
    favoriteActionSelector: '.item-metas-wrap .fav-button',
    favoriteGroupSelector: '.item-metas-wrap .item-favorite',
    deliveryTitleSelector: '.item-metas-wrap .delivery-accordion__title',
    deliveryGroupSelector: '.item-metas-wrap .accordion-group',
    copyButtonColor: '#56C0CA',
    downloadButtonColor: '#F6BD57',
    actionTextColor: '#1f1f1f',
    fieldButtonColor: '#EDEADA',
    fieldButtonTextColor: '#00A667',
    unavailableFieldButtonColor: '#F4F3EF',
    unavailableFieldButtonTextColor: '#8A8A8A',
    coverSelectors: ['.main_image img', '.item-main img'],
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
  flex: 0 0 120px;
  width: 120px;
  height: 35px;
  padding: 0 10px;
  color: var(--melon-archive-action-text);
  background: var(--melon-archive-copy-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.melon-archive-button--download {
  flex: 0 0 180px;
  width: 180px;
  height: 35px;
  padding: 0 10px;
  color: var(--melon-archive-action-text);
  background: var(--melon-archive-download-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
   * 保序去重并删除空值。
   * @param {string[]} values
   * @returns {string[]}
   */
  function uniqueNonEmpty(values) {
    return [...new Set(values.map(normalizeSpaces).filter(Boolean))];
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
   * @param {{includeBracketedContent?: boolean}} [options]
   * @returns {string}
   */
  function buildTitle(product, options = {}) {
    const { event, circle, author, title, genre } = buildTitleParts(product, options);

    let creatorPart = '';
    if (circle) {
      const authorPart = author ? ` (${author})` : AUTHOR_PLACEHOLDER ? ' ()' : '';
      creatorPart = `[${circle}${authorPart}]`;
    } else if (author) {
      creatorPart = `[${author}]`;
    }

    return [event ? `(${event})` : '', creatorPart, title, genre ? `(${genre})` : '']
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
   * 复制标题并下载封面。
   * @param {typeof SITE_DEFINITION} site
   * @param {() => string} getTitle
   * @param {HTMLButtonElement} button
   */
  async function copyAndDownload(site, getTitle, button) {
    const title = copyTitle(getTitle, button);
    if (!title) return;

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
   * @param {typeof SITE_DEFINITION} site
   */
  async function injectUi(site) {
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
      container.style.setProperty('--melon-archive-action-text', site.actionTextColor);

      const buttonGroup = document.createElement('div');
      buttonGroup.className = 'melon-archive-buttons';
      const copyButton = createButton('📋复制信息', 'copy');
      const downloadButton = createButton('📥复制并下载封面', 'download');
      const product = extractProduct(site);
      insertIssueDate(site, product.info);
      let includeBracketedContent = true;

      const getCurrentOptions = () => ({ includeBracketedContent });
      const getCurrentParts = () => buildTitleParts(product, getCurrentOptions());
      const getCurrentTitle = () => buildTitle(product, getCurrentOptions());
      const updatePageTitle = () => {
        const title = getCurrentTitle();
        if (title) anchor.textContent = title;
      };

      copyButton.addEventListener('click', () => copyTitle(getCurrentTitle, copyButton));
      downloadButton.addEventListener('click', () =>
        void copyAndDownload(site, getCurrentTitle, downloadButton)
      );

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

      if (hasBracketedContent(product.rawTitle)) {
        const optionLabel = document.createElement('label');
        optionLabel.className = 'melon-archive-option';
        const includeBracketedCheckbox = document.createElement('input');
        includeBracketedCheckbox.type = 'checkbox';
        includeBracketedCheckbox.checked = true;
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
      updatePageTitle();
      moveFavoriteActions(site);
    } catch (error) {
      console.error(`[${SCRIPT_LABEL}] UI injection failed.`, error);
      notify(`按钮注入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function main() {
    const site = getSiteDefinition(window.location.href);
    if (!site) return;
    GM_addStyle(STYLES);
    void injectUi(site);
  }

  // 仅供Node内置测试运行；用户脚本环境不会进入此分支。
  if (typeof module === 'object' && module.exports) {
    module.exports = {
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
    };
  } else {
    main();
  }
})();
