# AGENTS.md

## Project scope

Melon Archive is a dependency-free userscript for Melonbooks product detail pages. It extracts product metadata, builds a normalized archive title, replaces the page's original heading text, copies the title, and optionally downloads the displayed cover image.

Keep `README.md` user-facing. Installation, usage, permissions, privacy, troubleshooting, and support information belong there. Development notes, architecture, tests, release work, and implementation history belong in this file or the pull request description.

## Repository layout

- `melon-archive.user.js`: directly installable userscript and the complete runtime implementation.
- `test/core.test.cjs`: Node built-in tests for pure title, filename, URL, and extension logic.
- `package.json`: dependency-free syntax-check and test commands.
- `README.md`: end-user documentation only.

Do not introduce a build step unless the project grows enough to justify one. The file linked by `@downloadURL` must remain directly installable from the repository.

## Runtime architecture

The userscript is organized in the following order:

1. metadata block and constants
2. Melonbooks site definition
3. settings defaults, validation, and persistent storage helpers
4. pure normalization and title-building helpers
5. site and DOM extraction helpers
6. cover discovery and download helpers
7. page UI and Shadow DOM settings dialog
8. startup and CommonJS test exports

Melonbooks selectors and visual colors belong in `SITE_DEFINITION`. Keep title formatting and filename handling independent of the DOM so they can be tested in Node.

## Preserved behavior

- Default output format: `(イベント) [サークル (作家)] タイトル (ジャンル)`.
- The settings dialog may omit event, circle, author, or genre from the composed title, but must always retain the product title.
- If a circle exists without an author, preserve the empty `()` author placeholder.
- Include the genre by default when the page provides one, including `オリジナル`.
- Completed buttons remain clickable; only an active download temporarily disables its button.
- Keep the primary copy and download buttons content-sized so their widths adapt to the displayed text.
- Do not inject the action container more than once.
- Use the cover's detected image type for its filename extension.
- Replace the storefront's main heading text with the effective full archive title while preserving the heading element and its original styling.
- Include full-width `【...】` segments in the product title by default; allow the persistent setting to change the checkbox's initial state and the page checkbox to change the current state.
- Keep the replaced heading, copied title, and downloaded filename synchronized with that option.
- Show fixed-size field buttons for event, circle, author, title, and genre on the right side of the main product metadata when the corresponding setting is enabled.
- When a normalized field is empty, show `无{字段}信息`, apply the unavailable appearance, and disable its copy action.
- Display each field button as `label：value`; visually truncate overflow without changing the copied value.
- Each field-copy button copies only its normalized value without the full-title punctuation wrappers.
- Show the bracket option only when the original product title contains a paired full-width `【...】` segment, and place it after the two primary buttons in the same row.
- Label the bracket option `表示【】内容`.
- When enabled, normalize the detail table's `発行日` to `YYYY年MM月DD日` and display it directly above the storefront's existing `発売日` line.
- When enabled, make only the main product price clickable and keyboard-accessible; copy its current value as digits only without changing the displayed price text.
- When enabled, move the original favorite-circle and wishlist action group immediately above the delivery-method accordion without cloning or replacing its nodes.
- Register one Tampermonkey menu command that opens an accessible, Shadow DOM-isolated settings dialog.
- Persist only validated known boolean settings. Merge missing settings with defaults and remove storage when every value equals its default.
- Apply saved settings after saving and refreshing the current product page.
- Button status text must not append the generated title.

Treat changes to these behaviors as product decisions rather than cleanup.

## Metadata and permissions

- Keep `@namespace` under `https://github.com/uyuni-saline`.
- Keep `@homepageURL`, `@supportURL`, `@updateURL`, and `@downloadURL` aligned with this repository.
- Keep the grants required for the settings menu and storage: `GM_registerMenuCommand`, `GM_getValue`, `GM_setValue`, and `GM_deleteValue`.
- Increment `@version` for every released userscript change, using semantic versioning.
- Prefer narrow `@match` entries and retain the runtime URL validation in `getSiteDefinition`.
- `@connect *` currently supports cover images served from changing third-party CDNs. If it is narrowed, verify real cover hosts on both supported Melonbooks detail paths first.
- Avoid third-party `@require` dependencies when browser and userscript APIs are sufficient.

## Development commands

The project requires Node.js but has no npm dependencies.

```bash
node --check melon-archive.user.js
node --test
git diff --check
```

Run all three checks after changing JavaScript, tests, or metadata. Add or update tests whenever pure helpers change.

## Manual verification

Before a release, test currently available product pages for both supported paths:

- Melonbooks `/products/detail.php` path
- Melonbooks `/detail/detail.php` path, if reachable

Confirm the following:

- buttons appear once and in the intended location;
- the Tampermonkey menu opens only one settings dialog, whose save, cancel, reset, backdrop, and Escape interactions work;
- saved settings survive reloads, invalid stored values fall back safely, and a fully default configuration removes its stored value;
- the storefront heading element keeps its original styling while its text becomes the full archive title;
- when enabled, event, circle, author, title, and genre each get one fixed-size button in a vertical group on the right side of the product metadata;
- empty fields display a visually distinct `无{字段}信息` button whose copy action is disabled;
- every field button copies only its normalized field value;
- the full-width bracket option appears only for applicable original titles, follows the primary buttons, uses the saved default, and updates the heading and title field immediately;
- title-format settings independently omit event, circle, author, and genre while always retaining the product title;
- extracted event, circle, author, title, and genre are not duplicated;
- both buttons copy the title currently shown in the heading without appending it to button text;
- both primary buttons adapt their widths to their current status text;
- when enabled, clicking the main product price, or activating it with Enter or Space, copies digits only and does not affect prices in related-product lists;
- when enabled, the normalized `発行日` appears immediately above `発売日` when the source field is present;
- a cover downloads with a sanitized filename and correct extension;
- busy, success, missing-cover, and download-error states remain understandable;
- keyboard focus and activation work on both buttons;
- when enabled, the original favorite-circle and wishlist controls retain their behavior after moving above the delivery-method accordion.

Actual storefront HTML can change independently of this repository, so Node tests do not replace this manual verification.

## Change guidelines

- Prefer small selector additions or adapter-specific fallbacks over broad page-wide scraping.
- Resolve relative URLs with `new URL(value, window.location.href)`.
- Avoid collecting both a parent element and its nested children when extracting text; this creates duplicated values.
- Normalize whitespace at data boundaries.
- Preserve Unicode characters in titles and replace only filesystem-unsafe filename characters.
- Do not log extracted product information during normal operation.
- Keep user-visible messages concise and in Simplified Chinese unless localization is added consistently.

## Release checklist

1. Update the userscript version.
2. Run syntax, unit, and whitespace checks.
3. Perform the manual storefront checks that are currently possible.
4. Review metadata URLs and permissions.
5. Summarize user-visible changes in the pull request.
6. After merge, verify that the raw `main` URL opens an installable metadata block.
