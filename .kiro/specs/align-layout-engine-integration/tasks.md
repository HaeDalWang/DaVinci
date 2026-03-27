# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Alignment Bypasses Layout Engine Pipeline
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the alignment feature bypasses the Layout Engine pipeline
  - **Scoped PBT Approach**: Scope the property to concrete failing cases:
    - `buildAwsStandardLayout(services)` produces XML with hardcoded coordinates (ICON_STRIDE=70, CLOUD_X=220) instead of Layout Engine constants (SERVICE_GAP=80, GROUP_PADDING=40)
    - `buildAwsLeftRightLayout(services)` produces XML with hardcoded spacing (SUB_PAD=12, AZ_PAD=12) instead of Layout Engine constants
    - Both layout functions produce XML with zero edge cells, even when the original diagram has connections
  - Write property-based test in `src/core/__tests__/align-pipeline.property.test.js` using fast-check:
    - Generate services objects with at least one service in each tier (edge, public, web, db)
    - Assert that `buildAwsStandardLayout(services)` output contains no `edge="1"` cells (confirms connection loss bug)
    - Assert that spacing values in output XML do not match Layout Engine constants SERVICE_GAP=80 and GROUP_PADDING=40 (confirms inconsistent spacing bug)
    - Same assertions for `buildAwsLeftRightLayout(services)`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists: connections are lost and spacing is inconsistent)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Alignment Code Paths Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **IMPORTANT**: Write these tests BEFORE implementing the fix
  - Observe behavior on UNFIXED code:
    - `buildXml(json)` with various Lightweight_JSON inputs produces specific XML output
    - `calculateLayout(json)` with various Lightweight_JSON inputs produces specific position maps
    - `summarizeXml(xml)` with various drawio XML inputs produces specific Lightweight_JSON
  - Write property-based tests in `src/core/__tests__/align-preservation.property.test.js` using fast-check:
    - Generate random valid Lightweight_JSON (groups with nested children, services assigned to groups, connections between services)
    - Property: `buildXml(json)` produces valid XML containing all service IDs and all connection source/target pairs from input
    - Property: `calculateLayout(json)` returns positions for every group and service in input, all positions have non-negative x/y and positive width/height
    - Property: `calculateLayout(json)` positions every service within its parent group bounding box
    - Property: `summarizeXml(buildXml(json))` round-trip preserves service count and connection count
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.4, 3.5_

- [x] 3. Implement layout engine direction option
  - [x] 3.1 Add `direction` option to `calculateLayout()` in `src/core/layout-engine.js`
    - Add `options` parameter: `calculateLayout(json, options = {})`
    - When `options.direction === 'horizontal'`: arrange root groups vertically (stacked top-to-bottom) and child groups horizontally within each parent (left-to-right flow)
    - Default `direction` is `'vertical'` (current behavior unchanged)
    - Export the function with the new signature
    - _Bug_Condition: isBugCondition(input) where input.action IN ['aws-standard', 'left-right'] AND alignment bypasses calculateLayout()_
    - _Expected_Behavior: calculateLayout(json, { direction: 'horizontal' }) produces horizontal flow layout_
    - _Preservation: Default calculateLayout(json) behavior unchanged for all existing callers_
    - _Requirements: 2.1, 2.2, 3.4_

  - [x] 3.2 Pass `options` through `buildXml()` to `calculateLayout()` in `src/core/json-to-xml-builder.js`
    - Update `buildXml(json, options = {})` to forward `options` to `calculateLayout(json, options)`
    - Default behavior (no options) remains identical
    - _Bug_Condition: buildXml() currently ignores layout direction_
    - _Expected_Behavior: buildXml(json, { direction: 'horizontal' }) passes direction to calculateLayout()_
    - _Preservation: buildXml(json) without options produces identical output_
    - _Requirements: 2.2, 2.3, 3.4_

- [x] 4. Implement `reorganizeForAlignment()` in `src/core/aws-architecture-builder.js`
  - [x] 4.1 Create `reorganizeForAlignment(json, mode)` function
    - Takes Lightweight_JSON from `summarizeXml()` and mode string (`'hierarchy'` or `'left-right'`)
    - Classifies each service by tier using `SERVICE_PATTERNS` from `aws-service-catalog.js` (match service.type to pattern tier)
    - Builds new `groups` array: AWS Cloud → VPC → AZ-A/AZ-B → Public Subnet, Private Subnet (Web) with ASG, Private Subnet (DB)
    - Assigns services to appropriate groups: external → ungrouped, edge/security → AWS Cloud children, public → Public Subnet, web → Private Web Subnet (inside ASG), db → Private DB Subnet, mgmt/storage → VPC children
    - Splits services across AZ-A (first half) and AZ-B (second half)
    - Preserves `connections` array unchanged from input JSON
    - Returns reorganized Lightweight_JSON
    - Export the function
    - _Bug_Condition: Current code uses analyzeXmlServices() + buildAwsStandardLayout() which bypasses Lightweight_JSON pipeline_
    - _Expected_Behavior: reorganizeForAlignment() produces valid Lightweight_JSON with proper hierarchy for buildXml()_
    - _Preservation: analyzeXmlServices() remains exported and unchanged_
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [x] 4.2 Remove/deprecate `buildAwsStandardLayout()` and `buildAwsLeftRightLayout()` exports
    - Remove the two functions or mark as deprecated
    - Keep `analyzeXmlServices()` exported (still useful for other purposes)
    - _Requirements: 1.3, 2.3_

- [x] 5. Rewrite alignment handlers in `src/components/align-modal.js`
  - [x] 5.1 Update imports and rewrite `runAwsStandardLayout(bridge)`
    - Replace imports: remove `buildAwsStandardLayout`, `buildAwsLeftRightLayout`; add `summarizeXml` from `xml-summarizer.js`, `reorganizeForAlignment` from `aws-architecture-builder.js`, `buildXml` from `json-to-xml-builder.js`
    - Rewrite flow: `currentXml → summarizeXml(currentXml) → reorganizeForAlignment(json, 'hierarchy') → buildXml(reorganized) → bridge.loadXml(newXml)`
    - Service count for toast: use `reorganized.services.length`
    - Error handling: check `reorganized.services.length === 0` for "no AWS services" error
    - _Bug_Condition: Current runAwsStandardLayout() calls analyzeXmlServices() + buildAwsStandardLayout() bypassing pipeline_
    - _Expected_Behavior: Uses summarizeXml() → reorganizeForAlignment() → buildXml() pipeline_
    - _Preservation: Same loading overlay, toast messages, error handling UX_
    - _Requirements: 2.1, 2.3, 2.5, 3.1, 3.2, 3.3_

  - [x] 5.2 Rewrite `runLeftRightLayout(bridge)`
    - Rewrite flow: `currentXml → summarizeXml(currentXml) → reorganizeForAlignment(json, 'left-right') → buildXml(reorganized, { direction: 'horizontal' }) → bridge.loadXml(newXml)`
    - Service count for toast: use `reorganized.services.length`
    - Error handling: check `reorganized.services.length === 0`
    - _Bug_Condition: Current runLeftRightLayout() calls analyzeXmlServices() + buildAwsLeftRightLayout() bypassing pipeline_
    - _Expected_Behavior: Uses summarizeXml() → reorganizeForAlignment() → buildXml({ direction: 'horizontal' }) pipeline_
    - _Preservation: Same loading overlay, toast messages, error handling UX_
    - _Requirements: 2.2, 2.3, 2.5, 3.1, 3.2, 3.3_

  - [x] 5.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Alignment Uses Layout Engine Pipeline
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the alignment now uses the Layout Engine pipeline
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Alignment Code Paths Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 6. Write unit tests for new functions
  - [x] 6.1 Test `reorganizeForAlignment()` in `src/core/__tests__/aws-architecture-builder.test.js`
    - Test hierarchy mode: correctly classifies services by tier and builds AWS Cloud > VPC > AZ > Subnet hierarchy
    - Test left-right mode: produces same classification with horizontal layout intent
    - Test connection preservation: all connections from input JSON appear in output
    - Test edge cases: no services, unknown service types, services already in groups, single service
    - Test service splitting: services are split across AZ-A and AZ-B correctly
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [x] 6.2 Test `calculateLayout()` horizontal direction in `src/core/__tests__/layout-engine.test.js`
    - Test `calculateLayout(json, { direction: 'horizontal' })` produces different positions than default vertical
    - Test backward compatibility: `calculateLayout(json)` without options produces identical results to before
    - Test `calculateLayout(json, { direction: 'vertical' })` produces same results as no-option call
    - _Requirements: 2.2, 3.4_

  - [x] 6.3 Test `buildXml()` options passthrough in `src/core/__tests__/json-to-xml-builder.test.js`
    - Test `buildXml(json, { direction: 'horizontal' })` passes direction through to layout engine
    - Test `buildXml(json)` without options produces identical output to before
    - _Requirements: 2.3, 3.4_

- [x] 7. Checkpoint - Ensure all tests pass
  - Run `npm test` to verify all tests pass
  - Verify bug condition exploration test (task 1) now passes
  - Verify preservation property tests (task 2) still pass
  - Verify new unit tests (task 6) all pass
  - Verify existing layout-engine and json-to-xml-builder tests still pass
  - Ensure all tests pass, ask the user if questions arise.
