# Align Layout Engine Integration Bugfix Design

## Overview

The alignment feature ("계층 정렬" and "좌→우 흐름 정렬") in `align-modal.js` bypasses the canonical Layout Engine pipeline by using `aws-architecture-builder.js`'s own hardcoded coordinate logic and direct XML generation. This causes inconsistent spacing, duplicated layout code, and loss of original connections (edges). The fix routes both alignment modes through the established pipeline: `summarizeXml()` → reorganize Lightweight_JSON → `buildXml()` (which internally calls `calculateLayout()`). A new `reorganizeForAlignment()` function will classify services by tier and build the proper group hierarchy in Lightweight_JSON, while preserving all original connections. The Layout Engine will receive a `direction` option to support both vertical (hierarchy) and horizontal (left-right flow) layouts.

## Glossary

- **Bug_Condition (C)**: The condition where alignment is triggered — user clicks either "계층 정렬" or "좌→우 흐름 정렬" button, causing the system to bypass the Layout Engine pipeline
- **Property (P)**: The desired behavior — alignment produces XML via `summarizeXml()` → Lightweight_JSON reorganization → `buildXml()` with Layout Engine coordinates, preserving connections
- **Preservation**: Existing behaviors that must remain unchanged — modal UI, loading/toast UX, error handling for empty diagrams, `buildXml()` and `summarizeXml()` behavior when called from other parts of the app
- **Lightweight_JSON**: The intermediate `{ groups, services, connections }` format used by `xml-summarizer.js`, `layout-engine.js`, and `json-to-xml-builder.js`
- **Layout Engine**: `calculateLayout()` in `layout-engine.js` — computes absolute coordinates from Lightweight_JSON group/service structure
- **analyzeXmlServices()**: Function in `aws-architecture-builder.js` that parses XML into flat tier-based classification (external, edge, security, public, web, db, mgmt, storage)
- **SERVICE_PATTERNS**: Array in `aws-service-catalog.js` mapping drawio styles to `{ type, tier }` — the canonical source for service classification

## Bug Details

### Bug Condition

The bug manifests when a user clicks either alignment preset button. The `align-modal.js` calls `analyzeXmlServices()` → `buildAwsStandardLayout()` or `buildAwsLeftRightLayout()` which generate XML directly with hardcoded coordinates, bypassing `summarizeXml()`, `calculateLayout()`, and `buildXml()`. This results in inconsistent spacing constants, loss of connections, and duplicated layout logic.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { action: string, xml: string }
  OUTPUT: boolean
  
  RETURN input.action IN ['aws-standard', 'left-right']
         AND input.xml contains valid AWS service cells
         AND alignment is executed via buildAwsStandardLayout() or buildAwsLeftRightLayout()
         AND NOT executed via summarizeXml() → reorganize → buildXml() pipeline
END FUNCTION
```

### Examples

- User has a diagram with EC2, RDS, ALB connected by edges. Clicks "계층 정렬" → connections are lost, spacing uses `ICON_STRIDE=70` instead of `SERVICE_GAP=80`
- User has a diagram with CloudFront → ALB → EC2 → RDS flow. Clicks "좌→우 흐름 정렬" → connections are lost, spacing uses `SUB_PAD=12` instead of `GROUP_PADDING=40`
- User has a diagram with existing AWS Cloud > VPC > Subnet hierarchy. Clicks either alignment → original group structure is discarded and rebuilt from scratch with hardcoded coordinates
- User has a diagram with S3, CloudWatch alongside VPC services. Clicks "계층 정렬" → management/storage services placed with hardcoded offsets instead of Layout Engine grid

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Modal UI: same two preset buttons with same icons, names, descriptions
- Loading overlay during processing and success/error toast on completion
- Error message when no AWS services found in diagram
- `buildXml()` behavior when called from AI agent or other code paths
- `summarizeXml()` behavior when called from other code paths
- `calculateLayout()` default behavior (vertical layout) for non-alignment callers

**Scope:**
All inputs that do NOT involve clicking alignment preset buttons should be completely unaffected by this fix. This includes:
- AI agent generating architecture via `buildXml()`
- `summarizeXml()` parsing XML for conversation context
- Manual diagram editing in draw.io
- Other toolbar actions (analysis, well-architected review)

## Hypothesized Root Cause

Based on the bug description, the most likely issues are:

1. **Parallel Implementation**: `aws-architecture-builder.js` was written as a standalone module with its own XML generation (`makeCell()`, `wrapXml()`) rather than producing Lightweight_JSON for the existing pipeline. It predates or was developed independently of the Layout Engine.

2. **Missing Reorganization Layer**: There is no function that takes a flat Lightweight_JSON (from `summarizeXml()`) and reorganizes it into the AWS Cloud > VPC > AZ > Subnet hierarchy needed for alignment. The `analyzeXmlServices()` function classifies services by tier but outputs a flat object, not Lightweight_JSON.

3. **No Layout Direction Support**: The Layout Engine's `calculateLayout()` only supports one layout mode (child groups horizontal, services in grid). There is no `direction` option to switch between vertical hierarchy layout and horizontal flow layout.

4. **Connection Discard**: `analyzeXmlServices()` explicitly skips edge cells (`if (cell.getAttribute('edge') === '1') continue`), and neither `buildAwsStandardLayout()` nor `buildAwsLeftRightLayout()` re-creates connections.

## Correctness Properties

Property 1: Bug Condition - Alignment Uses Layout Engine Pipeline

_For any_ alignment action (계층 정렬 or 좌→우 흐름 정렬) on a diagram containing valid AWS services, the fixed code SHALL produce XML by calling `summarizeXml()` to extract Lightweight_JSON, reorganizing the JSON into the appropriate group hierarchy, and passing it to `buildXml()` which internally uses `calculateLayout()` with the Layout Engine's spacing constants.

**Validates: Requirements 2.1, 2.2, 2.3, 2.5**

Property 2: Bug Condition - Connection Preservation

_For any_ alignment action on a diagram that contains connections (edges) between services, the fixed code SHALL preserve all original connections in the output XML by carrying them through the Lightweight_JSON `connections` array.

**Validates: Requirements 2.4**

Property 3: Preservation - Non-Alignment Code Paths

_For any_ call to `buildXml()`, `summarizeXml()`, or `calculateLayout()` that does NOT originate from the alignment feature, the fixed code SHALL produce exactly the same result as the original code, preserving all existing functionality.

**Validates: Requirements 3.4, 3.5**

Property 4: Preservation - Alignment UI and UX

_For any_ user interaction with the alignment modal, the fixed code SHALL display the same two preset buttons, show loading overlay during processing, and display success/error toast notifications, identical to the original behavior.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:


**File**: `src/core/aws-architecture-builder.js`

**Function**: New `reorganizeForAlignment(json, mode)` (replaces `buildAwsStandardLayout` and `buildAwsLeftRightLayout`)

**Specific Changes**:
1. **Add `reorganizeForAlignment(json, mode)` function**: Takes Lightweight_JSON from `summarizeXml()` and a mode string (`'hierarchy'` or `'left-right'`). Uses `identifyServiceByStyle()` or the existing `SERVICE_PATTERNS` tier data to classify each service. Builds new `groups` array with AWS Cloud > VPC > AZ > Subnet hierarchy. Assigns each service to the appropriate group via `service.group`. Preserves `connections` array unchanged. Returns reorganized Lightweight_JSON.

2. **Service Classification Logic**: Reuse `analyzeXmlServices()`'s tier classification concept but operate on Lightweight_JSON services instead of raw XML cells. For each service in the input JSON, look up its `type` in `SERVICE_PATTERNS` to get the tier. Group tiers into hierarchy:
   - `external` tier → ungrouped (outside AWS Cloud)
   - `edge`, `security` tiers → direct children of AWS Cloud group
   - `public` tier → Public Subnet group
   - `web` tier → Private Subnet (Web) group, wrapped in ASG group
   - `db` tier → Private Subnet (DB) group
   - `mgmt`, `storage` tiers → direct children of VPC group (or AWS Cloud if no VPC)

3. **Hierarchy Construction**: Create group nodes: `aws_cloud` → `vpc` → `az_a`, `az_b` → `subnet_public_a`, `subnet_private_web_a`, `subnet_private_db_a` (and B variants). Split services across AZ-A and AZ-B (first half / second half). Set `children` arrays on each group to include child group IDs and service IDs.

4. **Keep `analyzeXmlServices()` exported**: It is still useful for service classification from raw XML. The new function can internally use a similar classification approach but on Lightweight_JSON service types.

5. **Remove or deprecate `buildAwsStandardLayout()` and `buildAwsLeftRightLayout()`**: These are replaced by the pipeline approach. Remove their exports.

---

**File**: `src/core/layout-engine.js`

**Function**: `calculateLayout(json, options)`

**Specific Changes**:
1. **Add `options` parameter**: `calculateLayout(json, options = {})` where `options.direction` can be `'vertical'` (default, current behavior) or `'horizontal'`.

2. **Horizontal layout mode**: When `direction === 'horizontal'`, change the top-level root group arrangement from horizontal to vertical stacking (root groups stack vertically). Within each group, child groups are arranged horizontally (left-to-right) instead of the current horizontal arrangement. This gives the left-to-right flow effect: AZ-A row on top, AZ-B row below, with subnets flowing left-to-right within each AZ.

3. **Backward compatibility**: Default `direction` is `'vertical'`, so all existing callers (including `buildXml()` without options) get the same behavior as before.

---

**File**: `src/core/json-to-xml-builder.js`

**Function**: `buildXml(json, options)`

**Specific Changes**:
1. **Pass `options` through to `calculateLayout()`**: `buildXml(json, options = {})` forwards `options` to `calculateLayout(json, options)` so the layout direction can be controlled by the caller.

---

**File**: `src/components/align-modal.js`

**Functions**: `runAwsStandardLayout()` and `runLeftRightLayout()`

**Specific Changes**:
1. **Replace `analyzeXmlServices` + `buildAwsStandardLayout` imports** with `summarizeXml` from `xml-summarizer.js`, `reorganizeForAlignment` from `aws-architecture-builder.js`, and `buildXml` from `json-to-xml-builder.js`.

2. **`runAwsStandardLayout(bridge)` rewrite**:
   ```
   currentXml = bridge.getCurrentXml()
   json = summarizeXml(currentXml)
   reorganized = reorganizeForAlignment(json, 'hierarchy')
   newXml = buildXml(reorganized)
   bridge.loadXml(newXml)
   ```

3. **`runLeftRightLayout(bridge)` rewrite**:
   ```
   currentXml = bridge.getCurrentXml()
   json = summarizeXml(currentXml)
   reorganized = reorganizeForAlignment(json, 'left-right')
   newXml = buildXml(reorganized, { direction: 'horizontal' })
   bridge.loadXml(newXml)
   ```

4. **Service count for toast**: Count `reorganized.services.length` instead of `Object.values(services).flat().length`.

5. **Error handling**: Check `reorganized.services.length === 0` for the "no AWS services" error case.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that call the current alignment functions and verify whether they use the Layout Engine pipeline. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Pipeline Bypass Test**: Call `buildAwsStandardLayout(services)` and verify the output XML does NOT use Layout Engine spacing constants (will confirm bug on unfixed code)
2. **Connection Loss Test**: Create XML with edges, run `analyzeXmlServices()` → `buildAwsStandardLayout()`, verify connections are missing from output (will confirm bug on unfixed code)
3. **Inconsistent Spacing Test**: Compare spacing values in `buildAwsStandardLayout()` output against `SERVICE_GAP`, `GROUP_PADDING` constants (will confirm inconsistency on unfixed code)
4. **Left-Right Connection Loss Test**: Same as #2 but with `buildAwsLeftRightLayout()` (will confirm bug on unfixed code)

**Expected Counterexamples**:
- Output XML from `buildAwsStandardLayout()` contains hardcoded coordinates not matching Layout Engine constants
- Output XML from both layout functions contains zero edge cells despite input having connections
- Possible causes: parallel implementation, explicit edge skipping in `analyzeXmlServices()`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  json := summarizeXml(input.xml)
  reorganized := reorganizeForAlignment(json, input.mode)
  result := buildXml(reorganized, options)
  ASSERT result contains all original connections
  ASSERT result uses Layout Engine spacing constants
  ASSERT result contains proper group hierarchy
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL json WHERE json is valid Lightweight_JSON DO
  ASSERT buildXml_original(json) = buildXml_fixed(json)
  ASSERT calculateLayout_original(json) = calculateLayout_fixed(json)
END FOR

FOR ALL xml WHERE xml is valid drawio XML DO
  ASSERT summarizeXml_original(xml) = summarizeXml_fixed(xml)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for `buildXml()` and `calculateLayout()` with various Lightweight_JSON inputs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **buildXml Preservation**: Verify `buildXml(json)` without options produces identical output before and after the fix for any valid Lightweight_JSON
2. **calculateLayout Preservation**: Verify `calculateLayout(json)` without options produces identical positions before and after the fix
3. **summarizeXml Preservation**: Verify `summarizeXml(xml)` produces identical Lightweight_JSON before and after the fix

### Unit Tests

- Test `reorganizeForAlignment(json, 'hierarchy')` correctly classifies services by tier and builds AWS Cloud > VPC > AZ > Subnet hierarchy
- Test `reorganizeForAlignment(json, 'left-right')` produces same classification but with horizontal flow layout intent
- Test `reorganizeForAlignment()` preserves all connections from input JSON
- Test `reorganizeForAlignment()` handles edge cases: no services, unknown service types, services already in groups
- Test `calculateLayout(json, { direction: 'horizontal' })` produces different positions than default vertical
- Test `buildXml(json, { direction: 'horizontal' })` passes direction through to layout engine
- Test `align-modal.js` integration: mock `summarizeXml`, `reorganizeForAlignment`, `buildXml` and verify correct call sequence

### Property-Based Tests

- Generate random Lightweight_JSON with various service types and verify `reorganizeForAlignment()` always produces valid Lightweight_JSON with all services accounted for and all connections preserved
- Generate random Lightweight_JSON and verify `buildXml(json)` (no options) produces identical output before and after the fix
- Generate random Lightweight_JSON and verify `calculateLayout(json)` (no options) produces identical positions before and after the fix

### Integration Tests

- Test full alignment flow: create XML with known services and connections → run hierarchy alignment → verify output XML has correct hierarchy, all services, and all connections
- Test full alignment flow: create XML with known services → run left-right alignment → verify output XML has horizontal layout and all connections
- Test that alignment with empty diagram shows appropriate error toast
- Test that alignment with non-AWS services shows appropriate error toast
