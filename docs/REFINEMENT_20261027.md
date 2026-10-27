# 2026-10-27 afternoon refinement

User reference screenshots drive this iteration; original user screenshots and comparison boards stay local and are not published.

## Behavior

- Check-in calendar uses square photo cells with a short complete location label. A day opens all photos, timestamps and notes. Export and membership cards are buttons; the existing QR wallet opens in a sheet.
- Nutrition dates are confined to the recording tab. Four program directions (loss, gain, shape, health) have three editable starting programs each, plus custom daily/training-rest/weekly targets. Confirmation is required to activate; prior effective target history remains intact.
- Food library has spectrum, recipes, knowledge and opinions. Four spectrum entrances browse the existing 47 sourced food records; each food exposes state, per-100g macros, portion calculator and source. The same food can serve different goals.
- Three full-day recipe combinations at five energy levels use only those catalogue foods. Actual kcal and macro totals are calculated from ingredient grams, including listed oil. Four meal arrangements save in one own-person transaction; retries use a stable request ID. They count toward intake only after the member confirms eating. Latest 500 day-plan receipts are retained.
- Six written knowledge articles cover weighing, training food, macros, protein powder, creatine and omega-3. Four editorial opinion summaries attribute Mike Israetel, Greg Nuckols and Jordan Feigenbaum, with author/topic search and original-source links. These are paraphrases, not quotations, endorsements or brand recommendations. Unknown publication dates remain unknown.
- Trends retain bars and add line, macro-energy ring and table views. Missing records/macros remain absent; averages use recorded days. Heatmap remains available. JSON export is a button.
- Personal page uses an edge-to-edge cover, avatar/name/status overlay, white content sheet, counts/edit row, bio/facts, icon shortcuts and underline content tabs. Existing cover, bio, privacy settings, tools and works are retained. Body details remain available in overview/editing.

## Sources and assets

Food numerical source remains USDA SR Legacy (2018), documented in FOOD_CATALOGUE.md. No nutritional numbers were inferred from generated images.

New collection images were generated with built-in ImageGen: a chicken/brown-rice/vegetable plate, a beef/rice/banana training plate, and a salmon/rice/vegetable/egg plate. Prompts requested realistic soft-daylight editorial food photos, right-side subjects, open space on the left, no labels or brands. Generated 1536×1024 PNG originals remain local; JPEG quality 82 delivery assets total about 1 MB. No reference screenshot artwork or private user photo was published.

Original editorial links are stored alongside the cards in `frontend/src/lib/nutrition-reading.js`. Primary sources were read on October 27: USDA FDC, MedlinePlus, Health Canada, NIH ODS, AIS, JTS Strength, RP Strength, Stronger by Science and Barbell Medicine. Older article dates are shown and applicability is explained in details.

## Validation

- Frontend: 86 tests passed across 10 relevant suites (nutrition, history, offline persistence, check-in wallet, media, growth and navigation).
- Node API: 28 tests passed, including four-meal atomic validation, retry deduplication, recording conversion, private account isolation and nutrition metadata history.
- Cloudflare: 52 tests passed against local D1/R2/runtime, including the new day-plan persistence route.
- Production frontend build passed. Existing bundle/dynamic-import notices remain.
- Browser verification: 393×852 mobile, 320×740 narrow mobile, 1200×900 desktop. No document overflow at 320 or 393. Desktop nutrition content is capped at 760px.
- Browser actions verified: record-only dates, program direction switching, spectrum collection, day arrangement save, four trend views, author filter/original-source detail, full check-in details and membership-wallet button.
- Screenshots in `docs/screenshots/round2` use an isolated fictional local account and already-public example media. They do not contain production personal records. Local source/reference comparisons and detailed iteration notes are in the workspace's `design-qa.md` and private temporary files.

## Release backup

A read-only scoped backup was made to the user-authorized private local file with mode 0600: training state, private messages and profile projections only. Nutrition, posts/community and authentication documents were excluded after automatic review rejected the broader query. A profile projection must be merged into the profile field when restoring; it must not replace an entire person document. No database migration or bulk production-data rewrite is part of this release.
