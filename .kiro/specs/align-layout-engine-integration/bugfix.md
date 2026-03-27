# Bugfix Requirements Document

## Introduction

The alignment feature in the toolbar ("계층 정렬" and "좌우 흐름정렬") bypasses the project's established Layout Engine (`layout-engine.js`) and JSON-to-XML Builder (`json-to-xml-builder.js`) pipeline. Instead, `aws-architecture-builder.js` uses its own hardcoded coordinate calculation logic and direct XML generation via `analyzeXmlServices()`, `buildAwsStandardLayout()`, and `buildAwsLeftRightLayout()`. This results in inconsistent spacing, duplicated layout logic, and loss of original diagram connections (edges). The fix should route both alignment modes through the canonical pipeline: `summarizeXml()` → Lightweight_JSON manipulation → `buildXml()` (which internally calls `calculateLayout()`).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user clicks "계층 정렬" THEN the system uses `analyzeXmlServices()` to parse XML into a flat tier-based classification (external, edge, public, web, db, etc.) and `buildAwsStandardLayout()` to generate XML with hardcoded coordinate values (e.g., `CLOUD_X=220`, `CLOUD_Y=30`, `ICON=40`, `ICON_STRIDE=70`, `MIN_SW=160`) that do not use the Layout Engine's spacing constants (`SERVICE_GAP=80`, `GROUP_PADDING=40`, `GROUP_LABEL_HEIGHT=50`, `SERVICE_LABEL_MARGIN=30`)

1.2 WHEN the user clicks "좌→우 흐름 정렬" THEN the system uses `analyzeXmlServices()` and `buildAwsLeftRightLayout()` to generate XML with its own hardcoded spacing values (`SUB_PAD=12`, `SUB_GAP=16`, `AZ_PAD=12`, `AZ_GAP_V=20`) that are inconsistent with the Layout Engine's constants

1.3 WHEN either alignment mode is applied THEN the system generates XML directly via `makeCell()` and `wrapXml()` helper functions in `aws-architecture-builder.js`, bypassing the `json-to-xml-builder.js` module's `buildXml()` function entirely

1.4 WHEN either alignment mode is applied to a diagram that has connections (edges) between services THEN the system discards all original connections because `analyzeXmlServices()` skips edge cells and neither `buildAwsStandardLayout()` nor `buildAwsLeftRightLayout()` preserves or re-creates them

1.5 WHEN either alignment mode is applied THEN the system discards the original group hierarchy from the XML (e.g., existing AWS Cloud, VPC, AZ, Subnet containers) and rebuilds a fixed structure, ignoring the Lightweight_JSON intermediate representation used by the rest of the project


### Expected Behavior (Correct)

2.1 WHEN the user clicks "계층 정렬" THEN the system SHALL first convert the current XML to Lightweight_JSON via `summarizeXml()`, reorganize the JSON into an AWS Cloud > VPC > AZ > Subnet hierarchy, and then generate new XML via `buildXml()` which internally uses `calculateLayout()` with the Layout Engine's spacing constants (`SERVICE_GAP=80`, `GROUP_PADDING=40`, `GROUP_LABEL_HEIGHT=50`)

2.2 WHEN the user clicks "좌→우 흐름 정렬" THEN the system SHALL first convert the current XML to Lightweight_JSON via `summarizeXml()`, reorganize the JSON with a horizontal flow layout concept, and then generate new XML via `buildXml()` which internally uses `calculateLayout()` with the Layout Engine's spacing constants

2.3 WHEN either alignment mode is applied THEN the system SHALL use `buildXml()` from `json-to-xml-builder.js` as the sole XML generation path, ensuring consistent style mapping via `getServiceStyle()` and `getGroupStyle()` from the service catalog

2.4 WHEN either alignment mode is applied to a diagram that has connections (edges) between services THEN the system SHALL preserve all original connections by carrying them through in the Lightweight_JSON `connections` array so that `buildXml()` re-creates them in the output XML

2.5 WHEN either alignment mode is applied THEN the system SHALL use `summarizeXml()` to extract the current diagram state into Lightweight_JSON, manipulate only the group/service structure and assignments in that JSON, and pass the result to `buildXml()` for XML generation

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the user opens the alignment modal THEN the system SHALL CONTINUE TO display the same two preset buttons ("계층 정렬" and "좌→우 흐름 정렬") with the same UI layout, icons, and descriptions in `align-modal.js`

3.2 WHEN the user clicks a preset button THEN the system SHALL CONTINUE TO show a loading overlay during processing and display a success/error toast notification upon completion

3.3 WHEN the diagram contains no AWS services (no aws4 style cells) THEN the system SHALL CONTINUE TO show an error message indicating no classifiable AWS services were found

3.4 WHEN `buildXml()` is called from other parts of the application (e.g., AI agent architecture generation) THEN the system SHALL CONTINUE TO produce correct XML output with Layout Engine-calculated coordinates, unaffected by the alignment refactoring

3.5 WHEN `summarizeXml()` is called from other parts of the application THEN the system SHALL CONTINUE TO correctly parse drawio XML into Lightweight_JSON format, unaffected by the alignment refactoring