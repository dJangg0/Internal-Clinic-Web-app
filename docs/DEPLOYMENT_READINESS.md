# EHR deployment readiness plan — Philippines

Reviewed 2026-11-14 against the working [SRS](SRS.md), [testing guide](TESTING.md), and repository implementation. This is a planning assessment for a Philippine clinic, not a certification or legal opinion. The clinic's privacy lead, clinical lead, and legal adviser must approve the operating policies before real patient data is used.

## Current decision

**No-go for real patient records or live clinical care.** The application is suitable for an internal demonstration with synthetic data. Publishing its frontend image serves a demo; it does not deploy an operational EHR.

| Evidence | Current state | Why it blocks clinical use |
| --- | --- | --- |
| [Backend service](../docker-compose.yml) and [backend directory](../backend/.gitkeep) | Compose runs a placeholder; there is no application API. | The browser cannot enforce access, transactional workflows, or shared records. |
| [Frontend state](../frontend/src/App.tsx) | Patients, appointments, and queue are stored in each browser's `localStorage`. | Another device lacks the same chart or queue; durable recovery and concurrent updates cannot be established. |
| [SRS baseline](SRS.md) and [SQL schema](../db/init.sql) | No authenticated staff session, enforced role permissions, clinical audit, final prescription workflow, or versioned migrations. | A displayed doctor name or database role enum does not prove author identity or protect patient records. |
| [Testing guide](TESTING.md) | Unit, component, browser, PostgreSQL, stack, and image tests cover the demo. | They do not establish API authorization, cross-device consistency, recovery, or safe clinical operation. |

The UI, initial relational constraints, synthetic fixtures, and CI checks are useful foundations. They should be retained and extended as the shared system is built.

## Is this an MVP today?

| Use of “MVP” | Assessment | Honest scope |
| --- | --- | --- |
| Pitch prototype with synthetic data | **Supports a controlled demonstration.** The local demo connects registration, chart linkage, triage, consultation, prescription drafts, retained history, booking, reset, and browser persistence. Public sample credentials demonstrate separate Doctor, Attendant, and Patient views. | Present it as an interactive prototype or demo MVP. Show QR check-in and the connected encounter as same-browser previews; shared devices, real authentication, and finalized clinical records remain planned. |
| Clinic operations pilot | **Not ready.** A real shared queue and intake need a server, identity/role checks, durable records, audit, recovery, and privacy approval. | If another EHR remains the official clinical record, call this an operations MVP once those controls and the multi-device queue work. |
| Real-patient EHR pilot | **Not ready.** The browser journey is locally connected, but verified shared arrival, authenticated staff actions, atomic encounter updates, final prescribing, and attributed retained records are not implemented. | Narrow feature breadth to one clinic, one doctor, and staff-assisted walk-ins, but keep the security, privacy, clinical safety, and recovery gates below. |

For a credible pitch, use the reset control and the synthetic Philippine scenario to show one local check-in, triage handoff, consultation, prescription draft, and history entry. Dashboard metrics distinguish illustrative values and queue tickets from clinical completion, and print previews identify drafts and the sample clinician. Keep those demo disclosures visible. The [README's sample credentials](../README.md#demo-login) demonstrate role-specific browser views, not protected accounts. Do not demonstrate a second phone scanning the QR as a working shared check-in.

The smallest real EHR pilot should complete one staff-assisted walk-in end to end: find or register the patient; confirm two identifiers, allergies, and current medicines; accept one linked arrival and visit; record triage; start an authenticated doctor consultation; finalize a reviewed note and prescription; and retain history with attributed corrections. The API, migrations, authorization, audit, backup/restore, downtime reconciliation, privacy decisions, and negative/concurrency tests remain required. Public QR intake, appointment priority/hold controls, Patient accounts/opening modals, multiple doctors, and external FHIR exchange may be staged later only after the first-release scope is explicitly updated in the SRS. If QR and holds are the pitch's main promise, include them in the first pilot instead of treating them as delivered by the current demo.

Verification snapshot (2026-11-14): `npm run typecheck` passed; `npm run test:coverage` passed all **129** unit/component tests with **81.66%** line coverage and all configured coverage gates; and `npm run test:e2e` passed **16** desktop/mobile checks against a production build. This includes public sample-credential matching, role-specific browser views, routing/session boundaries, cover selection, and the local demo journey. These results do not establish real authentication or server authorization and do not alter the no-go decision for real records.

## Release sequence and evidence

The phases are ordered by dependency. A phase is complete only when its acceptance evidence exists; passing a frontend build alone is never a release gate for patient data. Requirement IDs below refer to the [SRS](SRS.md).

| Phase | Deliverable | Exit evidence |
| --- | --- | --- |
| 0. Confirm the clinic contract | Clinical lead decides arrival ordering versus acceptance numbering, capacity/cutoffs, triage coverage, no-shows, multiple-doctor scope, prescription fields, correction rules, and downtime forms. Decide whether Patient sign-in is a portal in addition to the accountless QR form; decide the first-release scope of the three opening modals. Privacy lead defines lawful basis, notice, retention, access/correction/export, processor/hosting, breach, and incident policies and determines applicable NPC registrations. | Updated SRS and approved workflow/privacy decisions. Walk through a normal, fully booked, late-arrival, assisted, duplicate-patient, and doctor-absence day with clinic staff. Open policy decisions in SRS sections “Remaining business rules” and “Remaining product decisions” are resolved for the first release. |
| 1. Build the protected record system | Versioned PostgreSQL migrations and API; server validation, patient/visit/appointment consistency, idempotency and conflict handling; individual staff accounts, multifactor authentication, bounded/revocable sessions, role and patient-context authorization, and attributed audit events. Move clinical records out of browser storage. Define deployment configuration, encryption, secrets, retention, and backups. (`SEC-01/02`, `AUD-01`, `DAT-01`, `NFR-02/03/04/07`) | API tests deny unauthorized reads/writes for every role and patient boundary, including direct requests. Real PostgreSQL tests cover transactions and races; migration tests upgrade an existing disposable database. A backup restores linked patients, visits, and prescriptions. Security review records findings and fixes. |
| 2. Connect intake and appointments | Shared daily QR/session, public request and staff-assisted registration, identity confirmation, appointment or walk-in acceptance, physical-arrival order, triage, on-hold placement, explicit doctor next choice, and same visit across devices. (`INT-01–09`, `APT-04–06`, `PAT-01–04`, `TRI-01`) | API/database and two-device browser tests cover SRS scenarios 13–27 and 29: retries, concurrent acceptance, room/queue identity mistakes, held arrivals, and consultation-start races. No duplicate chart, visit, placement, or number; no unauthorized role action. |
| 3. Complete the clinical record | Doctor-reviewed current medicines and allergies; linked encounter notes, authenticated finalization, addenda, finalized prescriptions, accurate print status, and longitudinal history. (`ALL-01`, `MED-01`, `VIS-01–04`, `RX-01–03`, `HIS-01`) | Clinician-reviewed tests cover scenarios 30–31, including unknown versus none, incomplete drafts, wrong-patient prevention, attested content and amendments, and patient-specific history. Record the chosen policy for any alerting or interaction checking; do not imply it exists when absent. |
| 4. Prove operational readiness | Privacy impact assessment and clinic policies; threat model and web/API security verification; accessibility review; monitoring and alerting; capacity test against agreed workload; outage and paper reconciliation rehearsal; incident and restore drills; staff training and clinician acceptance. (`NFR-01–08`, `DAT-02`) | Scenarios 32–34 and the [testing guide's required checks](TESTING.md) pass. Resolve critical/high clinical or security findings; document approved recovery objectives and measured restore result, on-call/incident ownership, secure data export, and signed clinical/privacy go-live decisions. Start any real-data pilot only after this gate. |
| 5. Add exchange when required | Versioned export mapping and, if a partner requires it, an authenticated interoperability endpoint using a stable HL7 FHIR version/profile. (`DAT-02`) | Validate round-trip patient/encounter/observation/allergy/medicine/prescription links, identity, provenance, authorization, and partner contract. External FHIR exchange is not a prerequisite for a single-clinic launch unless a specific integration or regulation requires it. |

The demo now provides public sample-credential routing and a limited Patient view, while real account sign-in and the recalled introductory modals (`AUTH-01/02`) remain planned. A Patient demo selection grants no chart access and does not establish protected patient identity. If patient accounts are in the first release, include account proofing/recovery, patient-specific authorization, and scenario 28 in phase 1/4 evidence. If deferred, update the SRS and release scope explicitly; the public QR registration can remain accountless and limited to a private submission receipt.

## Standards and Philippine obligations used for this plan

| Source | Application to this project |
| --- | --- |
| [Philippine Data Privacy Act, RA 10173](https://privacy.gov.ph/data-privacy-act/) and [NPC Circular 2023-06](https://privacy.gov.ph/wp-content/uploads/2024/03/NPC-Circular-Repeal-16-01-Signed.pdf) | Health information is sensitive personal information. The clinic must assess lawful processing, data-subject rights, security, accountable roles, privacy impact assessment, privacy program, retention, breach response, and business continuity with its privacy/legal leads (`NFR-07`, `SEC-01/02`, `AUD-01`, `DAT-02`). This document does not certify compliance. |
| [ONC SAFER Guides](https://healthit.gov/clinical-quality-and-safety/safer-guides/) and [Joint Commission ambulatory safety goals](https://www.jointcommission.org/en-us/standards/national-patient-safety-goals) | International **safety benchmarks** for patient identification, medication information, system management, and downtime (`PAT-04`, `MED-01`, `NFR-08`). They are not automatically Philippine legal duties or US certification requirements. |
| [WHO Medication Without Harm](https://www.who.int/initiatives/medication-without-harm/) | Medication review and accurate handoff are clinical safety goals (`MED-01`, `RX-03`). The app must not promise automatic allergy or interaction checking without a validated service and policy. |
| [OWASP ASVS](https://asvs.owasp.org/), [NIST Digital Identity Guidelines](https://pages.nist.gov/800-63-4/sp800-63b.html), and [NIST Cybersecurity Framework 2.0](https://www.nist.gov/cyberframework) | Review frameworks for web/API controls, staff authentication, and the clinic's security governance, detection, response, and recovery (`SEC-02`, `NFR-03/04`). Select and record the applicable controls and verify them; do not claim certification merely by citing a framework. |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Use Level AA as the accessibility target for critical patient and staff web journeys, supported by automated and manual testing (`NFR-01`). |
| [HL7 FHIR](https://hl7.org/fhir/R4/) and the [draft Philippine Core guide](https://fhir.doh.gov.ph/phcore/0.2.0/en/) | Model portable patient, appointment, encounter, observation, allergy, medicine, prescription, audit, and provenance data (`DAT-02`). The Philippine guide states it is in development and unavailable for production use; track it, but do not claim conformance or make its current draft a release dependency. |

US HIPAA and ONC certification are not assumed to apply to a Philippine-only clinic. Confirm any additional Department of Health, PhilHealth, professional, or hosting obligations for the clinic's actual operating model and integrations with local advisers.

## Go-live decision record

The release owner should record a **yes** with evidence for each item before real patient data is entered:

1. Clinical workflow and patient-safety scenarios are approved by the doctor and reception/triage staff; no first-release policy is still ambiguous.
2. Every protected API and record export enforces authenticated actor and patient context; negative authorization and session-revocation tests pass.
3. Shared database migrations, concurrency tests, audit trail, final notes/prescriptions, and correction history pass on a disposable PostgreSQL environment.
4. Privacy lead approves the Philippine privacy impact assessment, applicable NPC registrations, notices, data rights, retention, processor/hosting, incident, and downtime policies.
5. A restore and clinical downtime reconciliation exercise succeeds against agreed recovery objectives; monitoring and a named response owner exist.
6. Security, accessibility, clinician acceptance, and agreed workload results are reviewed; critical/high clinical or security findings are resolved, and remaining risks are documented and accepted by the accountable clinic owner.

Until then, keep all development, demos, screenshots, and tests on synthetic patient data.
