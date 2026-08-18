// ==UserScript==
// @name         Melon Archive - 同人志标题与封面
// @namespace    https://github.com/uyuni-saline
// @version      1.0.0
// @description  在Melonbooks与Toranoana商品页生成规范标题，并复制标题或下载封面。
// @author       Saline
// @homepageURL  https://github.com/uyuni-saline/melon-archive
// @supportURL   https://github.com/uyuni-saline/melon-archive/issues
// @updateURL    https://raw.githubusercontent.com/uyuni-saline/melon-archive/main/melon-archive.user.js
// @downloadURL  https://raw.githubusercontent.com/uyuni-saline/melon-archive/main/melon-archive.user.js
// @match        https://www.melonbooks.co.jp/detail/detail.php*
// @match        https://www.melonbooks.co.jp/products/detail.php*
// @match        https://ec.toranoana.jp/tora/ec/item/*
// @match        https://ec.toranoana.jp/tora_r/ec/item/*
// @match        https://ec.toranoana.shop/tora/ec/item/*
// @match        https://ec.toranoana.shop/tora_r/ec/item/*
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
  const AUTHOR_PLACEHOLDER = true;
  const ELEMENT_WAIT_TIMEOUT_MS = 12_000;
  const DOWNLOAD_TIMEOUT_MS = 30_000;

  const SITE_DEFINITIONS = Object.freeze({
    melonbooks: {
      id: 'melonbooks',
      hostnames: ['www.melonbooks.co.jp'],
      paths: ['/detail/detail.php', '/products/detail.php'],
      anchorSelector: '.page-header',
      titleSelector: '.page-header',
      rowSelector: '.item-detail .table-wrapper tr',
      accent: '#f5a623',
      textColor: '#1f1f1f',
      coverSelectors: ['.main_image img', '.item-main img'],
    },
    toranoana: {
      id: 'toranoana',
      hostnames: ['ec.toranoana.jp', 'ec.toranoana.shop'],
      pathPattern: /^\/tora(?:_r)?\/ec\/item\/\d+\/?$/u,
      anchorSelector: '.product-detail-desc-title > span',
      titleSelector: '.product-detail-desc-title > span',
      rowSelector: '.product-detail-spec-table tr',
      accent: '#d92831',
      textColor: '#ffffff',
      coverSelectors: [
        '.product-detail-main-photo img',
        '.product-detail-image img',
        '.product-detail-main img',
      ],
    },
  });

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
  --melon-archive-accent: #555;
  --melon-archive-text: #fff;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 6px 0;
}

#${UI_ID} .melon-archive-button {
  appearance: none;
  width: auto;
  max-width: 100%;
  box-sizing: border-box;
  border: 0;
  border-radius: 3px;
  padding: 9px 14px;
  color: var(--melon-archive-text);
  background: var(--melon-archive-accent);
  font: 600 12px/1.35 "Microsoft YaHei", "Yu Gothic", Helvetica, Arial, sans-serif;
  text-align: center;
  overflow-wrap: anywhere;
  cursor: pointer;
}

#${UI_ID} .melon-archive-button:hover {
  filter: brightness(.94);
}

#${UI_ID} .melon-archive-button:focus-visible {
  outline: 2px solid #1967d2;
  outline-offset: 2px;
}

#${UI_ID} .melon-archive-button:disabled,
#${UI_ID} .melon-archive-button.is-busy {
  opacity: .62;
  cursor: wait;
}

#${UI_ID} .melon-archive-button.is-done {
  filter: saturate(.78);
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
   * 根据已提取的页面信息生成归档标题。
   * @param {{rawTitle?: string, info?: Record<string, string>}} product
   * @returns {string}
   */
  function buildTitle(product) {
    const info = product?.info ?? {};
    const title = normalizeSpaces(product?.rawTitle);
    const circle = normalizeSpaces(pickField(info, 'サークル名', 'サークル'))
      .replace(/\s*\(作品数\s*[:：]\s*\d+\)\s*$/u, '')
      .trim();
    const author = normalizeSpaces(pickField(info, '作家名', '作家', '作者'));
    const event = normalizeEventName(pickField(info, 'イベント', '初出イベント'));
    const genre = normalizeSpaces(pickField(info, 'ジャンル', 'ジャンル/サブジャンル'));

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
   * @returns {typeof SITE_DEFINITIONS[keyof typeof SITE_DEFINITIONS] | null}
   */
  function getSiteDefinition(input) {
    let url;
    try {
      url = input instanceof URL ? input : new URL(input);
    } catch {
      return null;
    }

    for (const definition of Object.values(SITE_DEFINITIONS)) {
      if (!definition.hostnames.includes(url.hostname)) continue;
      if (
        definition.paths?.includes(url.pathname) &&
        /^\d+$/u.test(url.searchParams.get('product_id') ?? '')
      ) {
        return definition;
      }
      if (definition.pathPattern?.test(url.pathname)) return definition;
    }
    return null;
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
   * @param {typeof SITE_DEFINITIONS[keyof typeof SITE_DEFINITIONS]} site
   * @returns {{rawTitle: string, info: Record<string, string>}}
   */
  function extractProduct(site) {
    const info = {};
    const titleElement = document.querySelector(site.titleSelector);
    const rawTitle = normalizeSpaces(titleElement?.innerText || titleElement?.textContent || '');

    for (const row of document.querySelectorAll(site.rowSelector)) {
      let keyCell;
      let valueCell;

      if (site.id === 'melonbooks') {
        keyCell = row.querySelector('th');
        valueCell = row.querySelector('td');
      } else {
        const cells = row.querySelectorAll('td');
        [keyCell, valueCell] = cells;
      }

      if (!keyCell || !valueCell) continue;
      const key = normalizeSpaces(keyCell.innerText || keyCell.textContent || '');
      if (!key) continue;

      const isGenre = key === 'ジャンル' || key === 'ジャンル/サブジャンル';
      const melonGenre = site.id === 'melonbooks' && isGenre ? extractMelonGenres(valueCell) : '';
      info[key] = melonGenre || extractCellValue(valueCell);
    }

    return { rawTitle, info };
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
   * 按精确区域、Melonbooks旧版图片接口、Open Graph的顺序寻找封面。
   * @param {typeof SITE_DEFINITIONS[keyof typeof SITE_DEFINITIONS]} site
   * @returns {string|null}
   */
  function findCoverUrl(site) {
    for (const selector of site.coverSelectors) {
      const url = getImageUrl(document.querySelector(selector));
      if (url) return url;
    }

    const legacyMelonImage = [...document.images].find((image) =>
      getImageUrl(image)?.includes('/user_data/packages/resize_image.php?image=')
    );
    const legacyUrl = getImageUrl(legacyMelonImage);
    if (legacyUrl) return legacyUrl;

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
   * @returns {HTMLButtonElement}
   */
  function createButton(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'melon-archive-button';
    button.textContent = label;
    button.title = label;
    return button;
  }

  /**
   * 生成并复制当前商品标题。
   * @param {typeof SITE_DEFINITIONS[keyof typeof SITE_DEFINITIONS]} site
   * @param {HTMLButtonElement} button
   * @returns {string|null}
   */
  function copyTitle(site, button) {
    const title = buildTitle(extractProduct(site));
    if (!title) {
      button.textContent = '❌ 未找到标题';
      notify('未能从页面提取商品标题，页面结构可能已经变化。');
      return null;
    }

    GM_setClipboard(title, 'text');
    button.title = title;
    setButtonDone(button, `✅ 已复制 ${title}`);
    return title;
  }

  /**
   * 复制标题并下载封面。
   * @param {typeof SITE_DEFINITIONS[keyof typeof SITE_DEFINITIONS]} site
   * @param {HTMLButtonElement} button
   */
  async function copyAndDownload(site, button) {
    const title = copyTitle(site, button);
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
      button.title = title;
      setButtonDone(button, `✅ 已下载 ${title}`);
    } catch (error) {
      console.error(`[${SCRIPT_LABEL}] Cover download failed.`, error);
      button.disabled = false;
      button.classList.remove('is-busy');
      button.textContent = '❌ 下载失败';
      notify(`封面下载失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * @param {typeof SITE_DEFINITIONS[keyof typeof SITE_DEFINITIONS]} site
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
      container.style.setProperty('--melon-archive-accent', site.accent);
      container.style.setProperty('--melon-archive-text', site.textColor);

      const copyButton = createButton('复制信息');
      const downloadButton = createButton('复制并下载封面');
      copyButton.addEventListener('click', () => copyTitle(site, copyButton));
      downloadButton.addEventListener('click', () => void copyAndDownload(site, downloadButton));

      container.append(copyButton, downloadButton);
      anchor.after(container);
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
      getSiteDefinition,
      inferImageExtension,
      normalizeEventName,
      normalizeSpaces,
      sanitizeFilename,
    };
  } else {
    main();
  }
})();
