# Legal & Content Policy

## 1. Independent Project

**RT-Library** is an independent open-source desktop software application.

RT-Library is **not** affiliated with, endorsed by, sponsored by, or maintained by:
- RuTracker (`rutracker.org`) or its operators;
- Video game publishers, developers, or distributors;
- Console manufacturers or hardware platform holders;
- Third-party image hosting providers (e.g., FastPic, ImageBam);
- Torrent tracker operators or indexers;
- Any operating system or software platform vendors.

---

## 2. No Content Distribution

RT-Library is designed solely as a local catalog management workspace and metadata browser.

RT-Library does **not** host, package, publish, supply, or distribute:
- Video games, software executables, binaries, or game patches;
- ROMs, ISOs, or disc images;
- Copyrighted media collections, artwork libraries, or music;
- BitTorrent payload data or file chunks;
- `.torrent` metadata files or bulk torrent archives;
- Pre-compiled magnet link catalogs or datasets;
- Pre-populated SQLite databases or sample library content.

---

## 3. Local Catalog Generation

All catalog entries, categories, metadata indices, image thumbnails, and user preferences are generated, fetched, and stored locally on the user's personal device in an embedded SQLite database.

The public source repository, distributed installer binaries, and official application packages do not include any pre-scraped data, cached topic dumps, or proprietary catalog items. The application initializes with an empty database.

---

## 4. Third-Party Interoperability

External network integrations in RT-Library are strictly intended for:
- User-initiated metadata indexing and synchronization;
- Personal collection organization and local search;
- Catalog interoperability with public web forums and metadata sources.

RT-Library is not an official client for any third-party service. All synchronization actions are executed on demand under direct user direction.

---

## 5. User Responsibility & Compliance

Users are solely responsible for:
- Complying with all applicable local, national, and international laws, regulations, and intellectual property statutes;
- Reviewing and adhering to the terms of service, acceptable use policies, and access rules of any third-party websites or services they interact with through the application;
- Managing their own personal data, download workflows, and credentials responsibly.

The developers of RT-Library do not provide legal advice, and no statement in this documentation constitutes a legal warranty or representation regarding third-party service terms or local copyright laws.

---

## 6. Access Controls & Anti-Bypass Policy

RT-Library is designed to avoid bundling or distributing third-party content. It does **not** incorporate mechanisms designed to circumvent security or access-control measures, such as:
- CAPTCHA automated solving;
- Cloudflare bot management or Turnstile challenges;
- Web Application Firewall (WAF) circumvention;
- Digital Rights Management (DRM) bypasses;
- Paywall or restricted access bypasses.

When an external service requires interactive human verification (such as a CAPTCHA challenge or web login), automated scraping routines immediately halt or pause execution and report an `interaction_required` status, allowing the user to handle verification manually in a standard browser window.

---

## 7. Trademarks & Brand Notices

All trademarks, registered trademarks, product names, company names, logos, service marks, and brand identities referenced within RT-Library documentation and source code are the property of their respective owners.

Their inclusion within this project is strictly for identification, technical description, and interoperability purposes, and does not imply endorsement, affiliation, sponsorship, or association.

