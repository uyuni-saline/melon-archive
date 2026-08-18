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
3. pure normalization and title-building helpers
4. site and DOM extraction helpers
5. cover discovery and download helpers
6. UI state and event handlers
7. startup and CommonJS test exports

Melonbooks selectors and visual colors belong in `SITE_DEFINITION`. Keep title formatting and filename handling independent of the DOM so they can be tested in Node.

## Preserved behavior

- Output format: `(イベント) [サークル (作家)] タイトル (ジャンル)`.
- If a circle exists without an author, preserve the empty `()` author placeholder.
- Include the genre when the page provides one, including `オリジナル`.
- Completed buttons remain clickable; only an active download temporarily disables its button.
- Do not inject the action container more than once.
- Use the cover's detected image type for its filename extension.
- Replace the storefront's main heading text with the effective full archive title while preserving the heading element and its original styling.
- Exclude full-width `【...】` segments from the product title by default; include them only when the user checks the option.
- Keep the replaced heading, copied title, and downloaded filename synchronized with that option.
- Place the option in the same button row immediately after the download button.
- Button status text must not append the generated title.

Treat changes to these behaviors as product decisions rather than cleanup.

## Metadata and permissions

- Keep `@namespace` under `https://github.com/uyuni-saline`.
- Keep `@homepageURL`, `@supportURL`, `@updateURL`, and `@downloadURL` aligned with this repository.
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
- the storefront heading element keeps its original styling while its text becomes the full archive title;
- the full-width bracket option follows the download button, is unchecked by default, and updates the heading immediately;
- extracted event, circle, author, title, and genre are not duplicated;
- both buttons copy the title currently shown in the heading without appending it to button text;
- a cover downloads with a sanitized filename and correct extension;
- busy, success, missing-cover, and download-error states remain understandable;
- keyboard focus and activation work on both buttons.

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
