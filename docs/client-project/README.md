# Lumière Virtual Try-On — Client Project Documentation Set

**Project:** Lumière — AI Virtual Jewellery Try-On Studio
**Repository:** `Virtual-try`

This folder contains the formal project documentation pack (company/client delivery style). Every statement in these documents is derived from the project's own source: [`README.md`](../../README.md), [`DOCUMENTATION.md`](../../DOCUMENTATION.md), the modular guides in [`docs/`](../), and the code in [`server.py`](../../server.py) / [`frontend/src/`](../../frontend/src/).

## Document Index

### 1. Project Management
| Doc | Contents |
|---|---|
| [BUSINESS_REQUIREMENTS.md](./01-project/01_BUSINESS_REQUIREMENTS.md) | Business requirements & objectives |
| [SRS.md](./01-project/02_SRS.md) | Software Requirements Specification (functional + non-functional) |
| [WBS.md](./01-project/03_WBS.md) | Work Breakdown Structure mapped to repository modules |
| [STATUS_REPORT.md](./01-project/04_STATUS_REPORT.md) | Status report (fill-in template with current snapshot) |
| [RISK_REGISTER.md](./01-project/05_RISK_REGISTER.md) | Risks drawn from the project's own troubleshooting notes |
| [CHANGE_REQUEST_LOG.md](./01-project/06_CHANGE_REQUEST_LOG.md) | CR log (reconstructed from commit history) + CR form template |
| [MEETING_MINUTES_TEMPLATE.md](./01-project/07_MEETING_MINUTES_TEMPLATE.md) | Reusable meeting minutes form |

### 2. Engineering
| Doc | Contents |
|---|---|
| [HLD.md](./02-engineering/01_HLD.md) | High-Level Design (system architecture) |
| [LLD.md](./02-engineering/02_LLD.md) | Low-Level Design (modules, pipeline, math) |
| [API_SPECIFICATION.md](./02-engineering/03_API_SPECIFICATION.md) | REST API contract (from `server.py`) |
| [DATA_MODEL.md](./02-engineering/04_DATA_MODEL.md) | Catalogue & session data model |

### 3. Quality Assurance
| Doc | Contents |
|---|---|
| [TEST_STRATEGY.md](./03-qa/01_TEST_STRATEGY.md) | Test approach, environments, exit criteria |
| [TEST_REPORT.md](./03-qa/02_TEST_REPORT.md) | Test report template + verifiable checks |
| [UAT_ACCEPTANCE.md](./03-qa/03_UAT_ACCEPTANCE.md) | UAT scenarios & acceptance sign-off sheet |

### 4. Operations & Handover
| Doc | Contents |
|---|---|
| [DEPLOYMENT_RUNBOOK.md](./04-operations/01_DEPLOYMENT_RUNBOOK.md) | Setup, run, build, production start |
| [USER_MANUAL.md](./04-operations/02_USER_MANUAL.md) | End-user guide (storefront + try-on studio) |
| [ADMIN_MANUAL.md](./04-operations/03_ADMIN_MANUAL.md) | Catalogue administrator guide (adding products) |
| [HANDOVER_SIGNOFF.md](./04-operations/04_HANDOVER_SIGNOFF.md) | Delivery checklist, knowledge-transfer log, closure sign-off |

> Cross-reference: the deep technical guides ([ARCHITECTURE](../ARCHITECTURE.md), [TRY_ON_STUDIO](../TRY_ON_STUDIO.md), [VISION_AND_TRACKING](../VISION_AND_TRACKING.md), [3D_SHADING_AND_MATERIALS](../3D_SHADING_AND_MATERIALS.md), [DEVELOPER_GUIDE](../DEVELOPER_GUIDE.md)) remain the authoritative engineering references.
